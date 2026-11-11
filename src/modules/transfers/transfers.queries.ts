import type { Prisma } from "@/generated/tenant/client";
import type { TenantTx } from "@/lib/db/tenant";
import { NotFoundError } from "@/lib/errors";
import { variantLabel } from "@/modules/products";

export type TransferStatusValue = "DRAFT" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";

export type TransferListItem = {
  id: string;
  number: string;
  status: TransferStatusValue;
  fromOutletId: string;
  fromOutlet: string;
  toOutletId: string;
  toOutlet: string;
  quantity: number;
  createdAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
};

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
    quantity: t.items.reduce((s, i) => s + i.quantity, 0),
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
  items: {
    id: string;
    sku: string;
    label: string;
    quantity: number;
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
      items: { include: { variant: { include: { product: true } }, stockUnit: true } },
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
    quantity: t.items.reduce((s, i) => s + i.quantity, 0),
    createdAt: t.createdAt.toISOString(),
    dispatchedAt: t.dispatchedAt ? t.dispatchedAt.toISOString() : null,
    receivedAt: t.receivedAt ? t.receivedAt.toISOString() : null,
    notes: t.notes,
    createdBy: t.createdBy.name,
    dispatchedBy: t.dispatchedBy?.name ?? null,
    receivedBy: t.receivedBy?.name ?? null,
    items: t.items.map((i) => ({
      id: i.id,
      sku: i.variant.sku,
      label: variantLabel(i.variant.product.name, i.variant),
      quantity: i.quantity,
      identifier: i.stockUnit ? (i.stockUnit.imei ?? i.stockUnit.serialNumber) : null,
      stockUnitId: i.stockUnitId,
      unitCostCents: i.unitCostCents,
    })),
  };
}

export async function countIncomingTransfers(db: TenantTx, outletId: string): Promise<number> {
  return db.stockTransfer.count({ where: { toOutletId: outletId, status: "IN_TRANSIT" } });
}
