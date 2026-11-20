import type { Prisma } from "@/generated/tenant/client";
import type { TenantTx } from "@/lib/db/tenant";
import { NotFoundError } from "@/lib/errors";
import { variantLabel } from "@/modules/products";
import { OPEN_TRANSFER_STATUSES, outstandingQuantity, type TransferStatusValue } from "./transfer-status";

export type TransferListItem = {
  id: string;
  number: string;
  status: TransferStatusValue;
  fromOutletId: string;
  fromOutlet: string;
  toOutletId: string;
  toOutlet: string;
  quantity: number;
  receivedQuantity: number;
  /** Still in transit */
  outstandingQuantity: number;
  createdAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
};

type ItemCounts = { quantity: number; receivedQuantity: number; lostQuantity: number; returnedQuantity: number };

function sumCounts(items: ItemCounts[]) {
  return {
    quantity: items.reduce((s, i) => s + i.quantity, 0),
    receivedQuantity: items.reduce((s, i) => s + i.receivedQuantity, 0),
    outstandingQuantity: items.reduce((s, i) => s + outstandingQuantity(i), 0),
  };
}

export async function listTransfers(
  db: TenantTx,
  options: { outletId?: string; direction?: "in" | "out" | "all"; status?: TransferStatusValue; take?: number } = {},
): Promise<TransferListItem[]> {
  const direction = options.direction ?? "all";
  let outletFilter: Prisma.StockTransferWhereInput = {};
  if (options.outletId) {
    if (direction === "in") outletFilter = { toOutletId: options.outletId };
    else if (direction === "out") outletFilter = { fromOutletId: options.outletId };
    else outletFilter = { OR: [{ toOutletId: options.outletId }, { fromOutletId: options.outletId }] };
  }
  const rows = await db.stockTransfer.findMany({
    where: { ...outletFilter, status: options.status },
    include: { fromOutlet: true, toOutlet: true, items: true },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 200,
  });
  return rows.map((t) => ({
    id: t.id,
    number: t.number,
    status: t.status,
    fromOutletId: t.fromOutletId,
    fromOutlet: t.fromOutlet.code,
    toOutletId: t.toOutletId,
    toOutlet: t.toOutlet.code,
    ...sumCounts(t.items),
    createdAt: t.createdAt.toISOString(),
    dispatchedAt: t.dispatchedAt ? t.dispatchedAt.toISOString() : null,
    receivedAt: t.receivedAt ? t.receivedAt.toISOString() : null,
  }));
}

export type TransferDetail = TransferListItem & {
  fromOutletName: string;
  toOutletName: string;
  notes: string | null;
  createdBy: string;
  dispatchedBy: string | null;
  receivedBy: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  lostQuantity: number;
  returnedQuantity: number;
  items: {
    id: string;
    variantId: string;
    sku: string;
    label: string;
    quantity: number;
    receivedQuantity: number;
    lostQuantity: number;
    returnedQuantity: number;
    outstandingQuantity: number;
    /** IMEI / serial (serialized items only) */
    identifier: string | null;
    stockUnitId: string | null;
    unitCostCents: number;
  }[];
};

export async function getTransferDetail(db: TenantTx, id: string): Promise<TransferDetail> {
  const t = await db.stockTransfer.findUnique({
    where: { id },
    include: {
      fromOutlet: true,
      toOutlet: true,
      createdBy: true,
      dispatchedBy: true,
      receivedBy: true,
      resolvedBy: true,
      items: { include: { variant: { include: { product: true } }, stockUnit: true }, orderBy: { id: "asc" } },
    },
  });
  if (!t) throw new NotFoundError("Transfer not found");
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    fromOutletId: t.fromOutletId,
    fromOutlet: t.fromOutlet.code,
    fromOutletName: t.fromOutlet.name,
    toOutletId: t.toOutletId,
    toOutlet: t.toOutlet.code,
    toOutletName: t.toOutlet.name,
    ...sumCounts(t.items),
    lostQuantity: t.items.reduce((s, i) => s + i.lostQuantity, 0),
    returnedQuantity: t.items.reduce((s, i) => s + i.returnedQuantity, 0),
    createdAt: t.createdAt.toISOString(),
    dispatchedAt: t.dispatchedAt ? t.dispatchedAt.toISOString() : null,
    receivedAt: t.receivedAt ? t.receivedAt.toISOString() : null,
    notes: t.notes,
    createdBy: t.createdBy.name,
    dispatchedBy: t.dispatchedBy?.name ?? null,
    receivedBy: t.receivedBy?.name ?? null,
    resolvedBy: t.resolvedBy?.name ?? null,
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    resolutionNote: t.resolutionNote,
    items: t.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      sku: i.variant.sku,
      label: variantLabel(i.variant.product.name, i.variant),
      quantity: i.quantity,
      receivedQuantity: i.receivedQuantity,
      lostQuantity: i.lostQuantity,
      returnedQuantity: i.returnedQuantity,
      outstandingQuantity: outstandingQuantity(i),
      identifier: i.stockUnit ? (i.stockUnit.imei ?? i.stockUnit.serialNumber) : null,
      stockUnitId: i.stockUnitId,
      unitCostCents: i.unitCostCents,
    })),
  };
}

/** Transfers still on the way to this outlet (badge on the dashboard / transfer list). */
export async function countIncomingTransfers(db: TenantTx, outletId: string): Promise<number> {
  return db.stockTransfer.count({ where: { toOutletId: outletId, status: { in: [...OPEN_TRANSFER_STATUSES] } } });
}

export type ReturnableItems = {
  transferId: string;
  number: string;
  /** The outlet that received the goods (sends them back) */
  outletId: string;
  /** The outlet that sent them (receives them back) */
  backToOutletId: string;
  units: {
    id: string;
    imei: string | null;
    serialNumber: string | null;
    status: "IN_STOCK";
    outletId: string;
    outletCode: string;
    label: string;
  }[];
  lines: { variantId: string; label: string; sku: string; quantity: number; max: number }[];
};

/**
 * "Send items back": what was received on a transfer and is still in stock at the receiving outlet
 * (wrong model sent, damaged on arrival …). Used to pre-fill a new transfer in the other direction.
 */
export async function listReturnableItems(db: TenantTx, transferId: string): Promise<ReturnableItems> {
  const t = await db.stockTransfer.findUnique({
    where: { id: transferId },
    include: {
      toOutlet: true,
      items: { include: { variant: { include: { product: true } }, stockUnit: true }, orderBy: { id: "asc" } },
    },
  });
  if (!t) throw new NotFoundError("Transfer not found");

  const units: ReturnableItems["units"] = [];
  const received = new Map<string, { label: string; sku: string; quantity: number }>();
  for (const i of t.items) {
    if (i.receivedQuantity <= 0) continue;
    const label = variantLabel(i.variant.product.name, i.variant);
    if (i.stockUnit) {
      if (i.stockUnit.status === "IN_STOCK" && i.stockUnit.outletId === t.toOutletId) {
        units.push({
          id: i.stockUnit.id,
          imei: i.stockUnit.imei,
          serialNumber: i.stockUnit.serialNumber,
          status: "IN_STOCK",
          outletId: t.toOutletId,
          outletCode: t.toOutlet.code,
          label,
        });
      }
    } else {
      const prev = received.get(i.variantId);
      received.set(i.variantId, { label, sku: i.variant.sku, quantity: (prev?.quantity ?? 0) + i.receivedQuantity });
    }
  }
  const levels = received.size
    ? await db.stockLevel.findMany({ where: { outletId: t.toOutletId, variantId: { in: [...received.keys()] } } })
    : [];
  const onHand = new Map(levels.map((l) => [l.variantId, l.quantity]));
  const lines = [...received.entries()]
    .map(([variantId, r]) => {
      const max = onHand.get(variantId) ?? 0;
      return { variantId, label: r.label, sku: r.sku, quantity: Math.min(r.quantity, max), max };
    })
    .filter((l) => l.quantity > 0);

  return { transferId: t.id, number: t.number, outletId: t.toOutletId, backToOutletId: t.fromOutletId, units, lines };
}
