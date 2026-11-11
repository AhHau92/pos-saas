import type { TenantTx } from "@/lib/db/tenant";
import { NotFoundError } from "@/lib/errors";
import { variantLabel, type ProductTypeValue } from "@/modules/products";

export type PurchaseOrderStatusValue = "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

export type PurchaseOrderListItem = {
  id: string;
  number: string;
  status: PurchaseOrderStatusValue;
  supplierName: string;
  outletCode: string;
  totalCents: number;
  itemCount: number;
  orderedQuantity: number;
  receivedQuantity: number;
  expectedAt: string | null;
  createdAt: string;
};

export async function listPurchaseOrders(
  db: TenantTx,
  options: { status?: PurchaseOrderStatusValue; q?: string; take?: number } = {},
): Promise<PurchaseOrderListItem[]> {
  const q = options.q?.trim();
  const rows = await db.purchaseOrder.findMany({
    where: {
      status: options.status,
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { supplier: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { supplier: true, outlet: true, items: true },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 200,
  });
  return rows.map((po) => ({
    id: po.id,
    number: po.number,
    status: po.status,
    supplierName: po.supplier.name,
    outletCode: po.outlet.code,
    totalCents: po.totalCents,
    itemCount: po.items.length,
    orderedQuantity: po.items.reduce((s, i) => s + i.quantity, 0),
    receivedQuantity: po.items.reduce((s, i) => s + i.receivedQuantity, 0),
    expectedAt: po.expectedAt ? po.expectedAt.toISOString() : null,
    createdAt: po.createdAt.toISOString(),
  }));
}

export type PurchaseOrderDetail = {
  id: string;
  number: string;
  status: PurchaseOrderStatusValue;
  supplierId: string;
  supplierName: string;
  outletId: string;
  outletName: string;
  expectedAt: string | null;
  orderedAt: string | null;
  notes: string | null;
  totalCents: number;
  createdBy: string;
  createdAt: string;
  items: {
    id: string;
    variantId: string;
    sku: string;
    label: string;
    productType: ProductTypeValue;
    quantity: number;
    receivedQuantity: number;
    unitCostCents: number;
  }[];
  receipts: {
    id: string;
    number: string;
    receivedAt: string;
    receivedBy: string;
    totalCents: number;
    notes: string | null;
    lines: { sku: string; label: string; quantity: number; unitCostCents: number; identifiers: string[] }[];
  }[];
};

export async function getPurchaseOrderDetail(db: TenantTx, id: string): Promise<PurchaseOrderDetail> {
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      outlet: true,
      createdBy: true,
      items: { include: { variant: { include: { product: true } } } },
      receipts: {
        orderBy: { receivedAt: "asc" },
        include: {
          receivedBy: true,
          items: { include: { variant: { include: { product: true } }, stockUnits: true } },
        },
      },
    },
  });
  if (!po) throw new NotFoundError("Purchase order not found");
  return {
    id: po.id,
    number: po.number,
    status: po.status,
    supplierId: po.supplierId,
    supplierName: po.supplier.name,
    outletId: po.outletId,
    outletName: `${po.outlet.code} · ${po.outlet.name}`,
    expectedAt: po.expectedAt ? po.expectedAt.toISOString() : null,
    orderedAt: po.orderedAt ? po.orderedAt.toISOString() : null,
    notes: po.notes,
    totalCents: po.totalCents,
    createdBy: po.createdBy.name,
    createdAt: po.createdAt.toISOString(),
    items: po.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      sku: i.variant.sku,
      label: variantLabel(i.variant.product.name, i.variant),
      productType: i.variant.product.type,
      quantity: i.quantity,
      receivedQuantity: i.receivedQuantity,
      unitCostCents: i.unitCostCents,
    })),
    receipts: po.receipts.map((r) => ({
      id: r.id,
      number: r.number,
      receivedAt: r.receivedAt.toISOString(),
      receivedBy: r.receivedBy.name,
      totalCents: r.totalCents,
      notes: r.notes,
      lines: r.items.map((ri) => ({
        sku: ri.variant.sku,
        label: variantLabel(ri.variant.product.name, ri.variant),
        quantity: ri.quantity,
        unitCostCents: ri.unitCostCents,
        identifiers: ri.stockUnits.map((u) => u.imei ?? u.serialNumber ?? u.id),
      })),
    })),
  };
}
