import { z } from "zod";
import type { TenantTx } from "@/lib/db/tenant";
import { nextDocumentNumber } from "@/lib/doc-number";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { parseDateInput } from "@/lib/time";
import { centsSchema, emptyToNull, idSchema, optionalText, parseInput, quantitySchema } from "@/lib/validation";
import { incomingUnitSchema, receiveStock, type DocumentRef } from "@/modules/inventory";

const itemSchema = z.object({
  variantId: idSchema,
  quantity: quantitySchema,
  unitCostCents: centsSchema,
});

const purchaseOrderSchema = z.object({
  supplierId: idSchema,
  outletId: idSchema,
  /** YYYY-MM-DD */
  expectedAt: z.string().optional().nullable(),
  notes: optionalText(1000),
  items: z.array(itemSchema).min(1, "Add at least one item").max(300),
  /** true = save and mark as ORDERED */
  submit: z.boolean().optional(),
});

const receiveSchema = z.object({
  notes: optionalText(1000),
  lines: z
    .array(
      z.object({
        purchaseOrderItemId: idSchema,
        quantity: z.number().int().min(0).max(100000),
        unitCostCents: centsSchema.optional(),
        units: z.array(incomingUnitSchema).max(1000).optional(),
      }),
    )
    .min(1),
});

type ItemInput = z.infer<typeof itemSchema>;

async function validateHeader(tx: TenantTx, supplierId: string, outletId: string): Promise<void> {
  const [supplier, outlet] = await Promise.all([
    tx.supplier.findUnique({ where: { id: supplierId } }),
    tx.outlet.findUnique({ where: { id: outletId } }),
  ]);
  if (!supplier || !supplier.isActive) throw new ValidationError("Supplier not found or inactive");
  if (!outlet || !outlet.isActive) throw new ValidationError("Receiving outlet not found or inactive");
}

async function validateItems(tx: TenantTx, items: ItemInput[]): Promise<void> {
  const ids = items.map((i) => i.variantId);
  if (new Set(ids).size !== ids.length) throw new ValidationError("The same product appears twice; combine the lines");
  const variants = await tx.productVariant.findMany({ where: { id: { in: ids } }, include: { product: true } });
  if (variants.length !== ids.length) throw new ValidationError("Some products were not found");
  const service = variants.find((v) => v.product.type === "SERVICE");
  if (service) throw new ValidationError(`${service.product.name} is a service and cannot be purchased into stock`);
}

function parseExpected(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = parseDateInput(value);
  if (!date) throw new ValidationError("Invalid expected date");
  return date;
}

function totalOf(items: ItemInput[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitCostCents, 0);
}

export async function createPurchaseOrder(ctx: ServiceContext, input: unknown): Promise<{ id: string; number: string }> {
  assertCan(ctx, "purchasing.manage");
  const data = parseInput(purchaseOrderSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await validateHeader(tx, data.supplierId, data.outletId);
    await validateItems(tx, data.items);
    const number = await nextDocumentNumber(tx, "PO");
    const po = await tx.purchaseOrder.create({
      data: {
        number,
        supplierId: data.supplierId,
        outletId: data.outletId,
        status: data.submit ? "ORDERED" : "DRAFT",
        orderedAt: data.submit ? new Date() : null,
        expectedAt: parseExpected(data.expectedAt),
        notes: emptyToNull(data.notes),
        totalCents: totalOf(data.items),
        createdById: ctx.userId,
        items: {
          create: data.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitCostCents: i.unitCostCents })),
        },
      },
    });
    return { id: po.id, number };
  });
}

/** Only DRAFT orders can be edited (items are replaced). */
export async function updatePurchaseOrder(ctx: ServiceContext, id: string, input: unknown): Promise<{ id: string }> {
  assertCan(ctx, "purchasing.manage");
  const data = parseInput(purchaseOrderSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundError("Purchase order not found");
    if (po.status !== "DRAFT") throw new ConflictError("Only draft purchase orders can be edited");
    await validateHeader(tx, data.supplierId, data.outletId);
    await validateItems(tx, data.items);
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: data.supplierId,
        outletId: data.outletId,
        status: data.submit ? "ORDERED" : "DRAFT",
        orderedAt: data.submit ? new Date() : null,
        expectedAt: parseExpected(data.expectedAt),
        notes: emptyToNull(data.notes),
        totalCents: totalOf(data.items),
        items: {
          create: data.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitCostCents: i.unitCostCents })),
        },
      },
    });
    return { id };
  });
}

export async function submitPurchaseOrder(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx, "purchasing.manage");
  const result = await ctx.db.purchaseOrder.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "ORDERED", orderedAt: new Date() },
  });
  if (result.count !== 1) throw new ConflictError("Only draft purchase orders can be submitted");
}

export async function cancelPurchaseOrder(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx, "purchasing.manage");
  await ctx.db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { receipts: true } });
    if (!po) throw new NotFoundError("Purchase order not found");
    if (po.receipts.length > 0) throw new ConflictError("Goods were already received; this order cannot be cancelled");
    const result = await tx.purchaseOrder.updateMany({
      where: { id, status: { in: ["DRAFT", "ORDERED"] } },
      data: { status: "CANCELLED" },
    });
    if (result.count !== 1) throw new ConflictError("This purchase order cannot be cancelled");
  });
}

/**
 * Goods receipt (GRN): puts the delivered quantities / IMEIs into stock at the PO's outlet.
 * Partial deliveries are allowed; the PO becomes PARTIALLY_RECEIVED until everything has arrived.
 */
export async function receivePurchaseOrder(
  ctx: ServiceContext,
  id: string,
  input: unknown,
): Promise<{ goodsReceiptId: string; number: string }> {
  assertCan(ctx, "purchasing.manage");
  const data = parseInput(receiveSchema, input);
  const lines = data.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) throw new ValidationError("Enter the quantity received for at least one item");

  return ctx.db.$transaction(
    async (tx) => {
      // Serialize receipts of the same PO
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
      const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
      if (!po) throw new NotFoundError("Purchase order not found");
      if (po.status === "CANCELLED" || po.status === "RECEIVED") {
        throw new ConflictError(`This purchase order is ${po.status.toLowerCase()}`);
      }

      const itemsById = new Map(po.items.map((i) => [i.id, i]));
      const seen = new Set<string>();
      for (const line of lines) {
        const item = itemsById.get(line.purchaseOrderItemId);
        if (!item) throw new ValidationError("Item does not belong to this purchase order");
        if (seen.has(item.id)) throw new ValidationError("The same item appears twice");
        seen.add(item.id);
        const remaining = item.quantity - item.receivedQuantity;
        if (line.quantity > remaining) {
          throw new ValidationError(`Receiving ${line.quantity} but only ${remaining} remaining on an item`);
        }
      }

      const number = await nextDocumentNumber(tx, "GRN");
      const receipt = await tx.goodsReceipt.create({
        data: {
          number,
          purchaseOrderId: po.id,
          supplierId: po.supplierId,
          outletId: po.outletId,
          notes: emptyToNull(data.notes),
          receivedById: ctx.userId,
        },
      });
      const ref: DocumentRef = { refType: "GOODS_RECEIPT", refId: receipt.id, refNo: number };

      let totalCents = 0;
      for (const line of lines) {
        const item = itemsById.get(line.purchaseOrderItemId)!;
        const unitCostCents = line.unitCostCents ?? item.unitCostCents;
        const receiptItem = await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: receipt.id,
            purchaseOrderItemId: item.id,
            variantId: item.variantId,
            quantity: line.quantity,
            unitCostCents,
          },
        });
        await receiveStock(tx, {
          outletId: po.outletId,
          variantId: item.variantId,
          quantity: line.quantity,
          unitCostCents,
          units: line.units,
          goodsReceiptItemId: receiptItem.id,
          movementType: "PURCHASE_RECEIPT",
          ref,
          userId: ctx.userId,
        });
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQuantity: { increment: line.quantity } },
        });
        totalCents += line.quantity * unitCostCents;
      }

      await tx.goodsReceipt.update({ where: { id: receipt.id }, data: { totalCents } });
      const after = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
      const complete = after.every((i) => i.receivedQuantity >= i.quantity);
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED", orderedAt: po.orderedAt ?? new Date() },
      });
      return { goodsReceiptId: receipt.id, number };
    },
    { timeout: 60000, maxWait: 10000 },
  );
}
