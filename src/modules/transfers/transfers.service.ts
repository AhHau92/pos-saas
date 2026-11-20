import { z } from "zod";
import type { TenantTx } from "@/lib/db/tenant";
import { can } from "@/lib/auth/permissions";
import { nextDocumentNumber } from "@/lib/doc-number";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { emptyToNull, idSchema, optionalText, parseInput, quantitySchema } from "@/lib/validation";
import {
  issueStock,
  receiveTransferredStock,
  returnTransferredStock,
  writeOffTransitStock,
  type DocumentRef,
} from "@/modules/inventory";
import { isOpenTransfer, outstandingQuantity, transferStatusAfter, type TransferStatusValue } from "./transfer-status";

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

const receiveSchema = z.object({
  /** Receive everything that is still in transit */
  all: z.boolean().optional(),
  /** What arrived: serialized items quantity 1 (one row per IMEI), accessories any quantity */
  lines: z.array(z.object({ itemId: idSchema, quantity: quantitySchema })).max(1000).optional(),
});

const resolveSchema = z.object({
  lines: z
    .array(z.object({ itemId: idSchema, quantity: quantitySchema, action: z.enum(["LOST", "RETURN"]) }))
    .min(1, "Choose what happened to at least one item")
    .max(1000),
  note: optionalText(500),
});

type TransferItemRow = {
  id: string;
  variantId: string;
  stockUnitId: string | null;
  quantity: number;
  unitCostCents: number;
  receivedQuantity: number;
  lostQuantity: number;
  returnedQuantity: number;
};

/** Locks the transfer row so receipts / resolutions of the same transfer run one after another. */
async function lockOpenTransfer(tx: TenantTx, id: string) {
  await tx.$queryRaw`SELECT id FROM "StockTransfer" WHERE id = ${id} FOR UPDATE`;
  const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
  if (!transfer) throw new NotFoundError("Transfer not found");
  if (!isOpenTransfer(transfer.status)) {
    throw new ConflictError(`This transfer is ${transfer.status.replace("_", " ").toLowerCase()} — nothing is in transit`);
  }
  return transfer;
}

/** Validates quantities against what is still in transit. Several lines may share an item (e.g. 2 lost + 1 returned). */
function checkAgainstOutstanding(items: TransferItemRow[], lines: { itemId: string; quantity: number }[]): Map<string, TransferItemRow> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const requested = new Map<string, number>();
  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item) throw new ValidationError("Item does not belong to this transfer");
    if (item.stockUnitId && line.quantity !== 1) throw new ValidationError("IMEI items are handled one unit at a time");
    requested.set(item.id, (requested.get(item.id) ?? 0) + line.quantity);
  }
  for (const [itemId, quantity] of requested) {
    const item = byId.get(itemId)!;
    const open = outstandingQuantity(item);
    if (quantity > open) {
      throw new ConflictError(
        open === 0 ? "An item was already received or settled — refresh the page" : `Only ${open} of an item is still in transit (got ${quantity})`,
      );
    }
  }
  return byId;
}

async function updateStatus(tx: TenantTx, transferId: string): Promise<TransferStatusValue> {
  const items = await tx.stockTransferItem.findMany({ where: { transferId } });
  return transferStatusAfter(items);
}

/**
 * Destination confirms what arrived — all of it, or part of it. Whatever is not received stays
 * in transit (it can be received later, or a manager settles it with resolveTransfer).
 * Cashiers can only receive into their own outlet.
 */
export async function receiveTransfer(
  ctx: ServiceContext,
  id: string,
  input: unknown = { all: true },
): Promise<{ status: TransferStatusValue; receivedQuantity: number }> {
  assertCan(ctx, "transfers.receive");
  const data = parseInput(receiveSchema, input ?? { all: true });
  return ctx.db.$transaction(
    async (tx) => {
      const transfer = await lockOpenTransfer(tx, id);
      if (!can(ctx.role, "outlets.switch") && transfer.toOutletId !== ctx.outletId) {
        throw new ForbiddenError("Only the receiving outlet can confirm this transfer");
      }
      const lines = data.all
        ? transfer.items.filter((i) => outstandingQuantity(i) > 0).map((i) => ({ itemId: i.id, quantity: outstandingQuantity(i) }))
        : (data.lines ?? []);
      if (lines.length === 0) throw new ValidationError("Scan or tick at least one item that arrived");
      const byId = checkAgainstOutstanding(transfer.items, lines);

      const ref: DocumentRef = { refType: "TRANSFER", refId: transfer.id, refNo: transfer.number };
      let receivedQuantity = 0;
      for (const line of lines) {
        const item = byId.get(line.itemId)!;
        await receiveTransferredStock(tx, {
          toOutletId: transfer.toOutletId,
          variantId: item.variantId,
          quantity: line.quantity,
          stockUnitId: item.stockUnitId,
          unitCostCents: item.unitCostCents,
          ref,
          userId: ctx.userId,
        });
        await tx.stockTransferItem.update({ where: { id: item.id }, data: { receivedQuantity: { increment: line.quantity } } });
        receivedQuantity += line.quantity;
      }
      const status = await updateStatus(tx, transfer.id);
      await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status, receivedById: ctx.userId, receivedAt: new Date() },
      });
      return { status, receivedQuantity };
    },
    { timeout: 60000, maxWait: 10000 },
  );
}

/**
 * Manager settles items that did not arrive:
 *   LOST   → written off (IMEI unit becomes WRITTEN_OFF; quantity recorded on the transfer)
 *   RETURN → back into the sending outlet's stock (never left, or came back)
 */
export async function resolveTransfer(ctx: ServiceContext, id: string, input: unknown): Promise<{ status: TransferStatusValue }> {
  assertCan(ctx, "transfers.manage");
  const data = parseInput(resolveSchema, input);
  return ctx.db.$transaction(
    async (tx) => {
      const transfer = await lockOpenTransfer(tx, id);
      const byId = checkAgainstOutstanding(transfer.items, data.lines);
      const note = emptyToNull(data.note);
      const ref: DocumentRef = { refType: "TRANSFER", refId: transfer.id, refNo: transfer.number };

      for (const line of data.lines) {
        const item = byId.get(line.itemId)!;
        if (line.action === "LOST") {
          await writeOffTransitStock(tx, {
            variantId: item.variantId,
            stockUnitId: item.stockUnitId,
            ref,
            userId: ctx.userId,
            note: note ? `Lost in transit: ${note}` : "Lost in transit",
          });
          await tx.stockTransferItem.update({ where: { id: item.id }, data: { lostQuantity: { increment: line.quantity } } });
        } else {
          await returnTransferredStock(tx, {
            fromOutletId: transfer.fromOutletId,
            variantId: item.variantId,
            quantity: line.quantity,
            stockUnitId: item.stockUnitId,
            unitCostCents: item.unitCostCents,
            ref,
            userId: ctx.userId,
            note: note ? `Returned to sender: ${note}` : null,
          });
          await tx.stockTransferItem.update({ where: { id: item.id }, data: { returnedQuantity: { increment: line.quantity } } });
        }
      }
      const status = await updateStatus(tx, transfer.id);
      await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status, resolvedById: ctx.userId, resolvedAt: new Date(), resolutionNote: note },
      });
      return { status };
    },
    { timeout: 60000, maxWait: 10000 },
  );
}

export async function cancelTransfer(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx, "transfers.manage");
  const result = await ctx.db.stockTransfer.updateMany({ where: { id, status: "DRAFT" }, data: { status: "CANCELLED" } });
  if (result.count !== 1) throw new ConflictError("Only draft transfers can be cancelled");
}
