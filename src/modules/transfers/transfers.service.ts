import { z } from "zod";
import type { TenantTx } from "@/lib/db/tenant";
import { can } from "@/lib/auth/permissions";
import { nextDocumentNumber } from "@/lib/doc-number";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { emptyToNull, idSchema, optionalText, parseInput, quantitySchema } from "@/lib/validation";
import { issueStock, receiveTransferredStock, type DocumentRef } from "@/modules/inventory";

const createSchema = z.object({
  fromOutletId: idSchema.optional(),
  toOutletId: idSchema,
  notes: optionalText(1000),
  /** Quantity items (accessories) */
  items: z.array(z.object({ variantId: idSchema, quantity: quantitySchema })).max(300).optional(),
  /** IMEI / serial units */
  stockUnitIds: z.array(idSchema).max(500).optional(),
  /** true = dispatch immediately (stock leaves the source outlet) */
  dispatch: z.boolean().optional(),
});

export async function createTransfer(ctx: ServiceContext, input: unknown): Promise<{ id: string; number: string }> {
  assertCan(ctx, "transfers.manage");
  const data = parseInput(createSchema, input);
  const fromOutletId = data.fromOutletId ?? ctx.outletId;
  if (fromOutletId === data.toOutletId) throw new ValidationError("Choose a different destination outlet");
  const unitIds = data.stockUnitIds ?? [];
  const items = data.items ?? [];
  if (unitIds.length === 0 && items.length === 0) throw new ValidationError("Add at least one item");
  if (new Set(unitIds).size !== unitIds.length) throw new ValidationError("The same IMEI appears twice");
  if (new Set(items.map((i) => i.variantId)).size !== items.length) {
    throw new ValidationError("The same product appears twice; combine the lines");
  }

  return ctx.db.$transaction(
    async (tx) => {
      const outlets = await tx.outlet.findMany({ where: { id: { in: [fromOutletId, data.toOutletId] }, isActive: true } });
      if (outlets.length !== 2) throw new ValidationError("Both outlets must exist and be active");

      const units = await tx.stockUnit.findMany({
        where: { id: { in: unitIds } },
        include: { variant: { include: { product: true } } },
      });
      if (units.length !== unitIds.length) throw new ValidationError("Some IMEI units were not found");
      for (const u of units) {
        const name = u.imei ?? u.serialNumber ?? u.id;
        if (u.status !== "IN_STOCK" || u.outletId !== fromOutletId) {
          throw new ConflictError(`${name} is not in stock at the sending outlet`);
        }
      }

      if (items.length > 0) {
        const variants = await tx.productVariant.findMany({
          where: { id: { in: items.map((i) => i.variantId) } },
          include: { product: true, stockLevels: { where: { outletId: fromOutletId } } },
        });
        for (const item of items) {
          const v = variants.find((x) => x.id === item.variantId);
          if (!v) throw new ValidationError("Product not found");
          if (v.product.type !== "NON_SERIALIZED") {
            throw new ValidationError(`${v.product.name}: transfer IMEI products by scanning each unit`);
          }
          const onHand = v.stockLevels[0]?.quantity ?? 0;
          if (onHand < item.quantity) {
            throw new ConflictError(`Not enough stock of ${v.sku} (available ${onHand}, requested ${item.quantity})`);
          }
        }
      }

      const number = await nextDocumentNumber(tx, "TR");
      const transfer = await tx.stockTransfer.create({
        data: {
          number,
          fromOutletId,
          toOutletId: data.toOutletId,
          notes: emptyToNull(data.notes),
          createdById: ctx.userId,
          items: {
            create: [
              ...units.map((u) => ({ variantId: u.variantId, stockUnitId: u.id, quantity: 1, unitCostCents: u.costCents })),
              ...items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
            ],
          },
        },
      });
      if (data.dispatch) await dispatchInTransaction(tx, transfer.id, ctx.userId);
      return { id: transfer.id, number };
    },
    { timeout: 30000, maxWait: 10000 },
  );
}

async function dispatchInTransaction(tx: TenantTx, transferId: string, userId: string): Promise<void> {
  const claimed = await tx.stockTransfer.updateMany({
    where: { id: transferId, status: "DRAFT" },
    data: { status: "IN_TRANSIT", dispatchedById: userId, dispatchedAt: new Date() },
  });
  if (claimed.count !== 1) throw new ConflictError("Only draft transfers can be dispatched");
  const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId }, include: { items: true } });
  if (!transfer) throw new NotFoundError("Transfer not found");
  const ref: DocumentRef = { refType: "TRANSFER", refId: transfer.id, refNo: transfer.number };
  for (const item of transfer.items) {
    const issued = await issueStock(tx, {
      outletId: transfer.fromOutletId,
      variantId: item.variantId,
      quantity: item.quantity,
      stockUnitId: item.stockUnitId,
      movementType: "TRANSFER_OUT",
      unitStatus: "IN_TRANSIT",
      ref,
      userId,
    });
    await tx.stockTransferItem.update({ where: { id: item.id }, data: { unitCostCents: issued.unitCostCents } });
  }
}

export async function dispatchTransfer(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx, "transfers.manage");
  await ctx.db.$transaction((tx) => dispatchInTransaction(tx, id, ctx.userId), { timeout: 30000, maxWait: 10000 });
}

/** Destination confirms receipt. Cashiers can only receive into their own outlet. */
export async function receiveTransfer(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx, "transfers.receive");
  await ctx.db.$transaction(
    async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
      if (!transfer) throw new NotFoundError("Transfer not found");
      if (!can(ctx.role, "outlets.switch") && transfer.toOutletId !== ctx.outletId) {
        throw new ForbiddenError("Only the receiving outlet can confirm this transfer");
      }
      const claimed = await tx.stockTransfer.updateMany({
        where: { id, status: "IN_TRANSIT" },
        data: { status: "RECEIVED", receivedById: ctx.userId, receivedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictError("Only transfers in transit can be received");
      const ref: DocumentRef = { refType: "TRANSFER", refId: transfer.id, refNo: transfer.number };
      for (const item of transfer.items) {
        await receiveTransferredStock(tx, {
          toOutletId: transfer.toOutletId,
          variantId: item.variantId,
          quantity: item.quantity,
          stockUnitId: item.stockUnitId,
          unitCostCents: item.unitCostCents,
          ref,
          userId: ctx.userId,
        });
      }
    },
    { timeout: 30000, maxWait: 10000 },
  );
}

export async function cancelTransfer(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx, "transfers.manage");
  const result = await ctx.db.stockTransfer.updateMany({ where: { id, status: "DRAFT" }, data: { status: "CANCELLED" } });
  if (result.count !== 1) throw new ConflictError("Only draft transfers can be cancelled");
}
