import type { Prisma } from "@/generated/tenant/client";
import type { TenantTx } from "@/lib/db/tenant";
import { NotFoundError } from "@/lib/errors";
import { variantLabel, type ProductTypeValue } from "@/modules/products";
import { normalizeIdentifier } from "./imei";
import type { UnitStatus } from "./unit-state";

// ───────────── stock per outlet ─────────────

export type StockMatrixRow = {
  variantId: string;
  sku: string;
  label: string;
  brandName: string | null;
  productType: ProductTypeValue;
  minStock: number;
  /** outletId → sellable quantity */
  byOutlet: Record<string, number>;
  total: number;
  inTransit: number;
};

export type StockMatrix = {
  outlets: { id: string; code: string; name: string }[];
  rows: StockMatrixRow[];
};

/** "各门店库存": every SKU × every outlet. */
export async function getStockMatrix(
  db: TenantTx,
  options: { q?: string; onlyInStock?: boolean; lowStockOnly?: boolean; take?: number } = {},
): Promise<StockMatrix> {
  const outlets = await db.outlet.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const words = (options.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  const variants = await db.productVariant.findMany({
    where: {
      isActive: true,
      product: { type: { in: ["SERIALIZED", "NON_SERIALIZED"] } },
      AND: words.map(
        (word): Prisma.ProductVariantWhereInput => ({
          OR: [
            { sku: { contains: word, mode: "insensitive" } },
            { barcode: { equals: word } },
            { color: { contains: word, mode: "insensitive" } },
            { storage: { contains: word, mode: "insensitive" } },
            { product: { name: { contains: word, mode: "insensitive" } } },
            { product: { brand: { name: { contains: word, mode: "insensitive" } } } },
          ],
        }),
      ),
    },
    include: { product: { include: { brand: true } }, stockLevels: true },
    orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    take: options.take ?? 500,
  });

  const transit = await db.stockTransferItem.groupBy({
    by: ["variantId"],
    where: { transfer: { status: "IN_TRANSIT" }, variantId: { in: variants.map((v) => v.id) } },
    _sum: { quantity: true },
  });
  const transitByVariant = new Map<string, number>(
    transit.map((t: { variantId: string; _sum: { quantity: number | null } }) => [t.variantId, t._sum.quantity ?? 0]),
  );

  let rows: StockMatrixRow[] = variants.map((v) => {
    const byOutlet: Record<string, number> = {};
    for (const level of v.stockLevels) byOutlet[level.outletId] = level.quantity;
    const total = v.stockLevels.reduce((s, l) => s + l.quantity, 0);
    return {
      variantId: v.id,
      sku: v.sku,
      label: variantLabel(v.product.name, v),
      brandName: v.product.brand?.name ?? null,
      productType: v.product.type,
      minStock: v.minStock,
      byOutlet,
      total,
      inTransit: transitByVariant.get(v.id) ?? 0,
    };
  });
  if (options.onlyInStock) rows = rows.filter((r) => r.total > 0 || r.inTransit > 0);
  if (options.lowStockOnly) {
    rows = rows.filter((r) => r.minStock > 0 && outlets.some((o) => (r.byOutlet[o.id] ?? 0) <= r.minStock));
  }
  return { outlets, rows };
}

export type LowStockItem = { variantId: string; sku: string; label: string; quantity: number; minStock: number };

export async function listLowStock(db: TenantTx, outletId: string, take = 20): Promise<LowStockItem[]> {
  const variants = await db.productVariant.findMany({
    where: { isActive: true, minStock: { gt: 0 }, product: { isActive: true, type: { not: "SERVICE" } } },
    include: { product: true, stockLevels: { where: { outletId } } },
    take: 1000,
  });
  return variants
    .map((v) => ({
      variantId: v.id,
      sku: v.sku,
      label: variantLabel(v.product.name, v),
      quantity: v.stockLevels[0]?.quantity ?? 0,
      minStock: v.minStock,
    }))
    .filter((i) => i.quantity <= i.minStock)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, take);
}

// ───────────── IMEI units ─────────────

export type UnitListItem = {
  id: string;
  imei: string | null;
  imei2: string | null;
  serialNumber: string | null;
  status: UnitStatus;
  sku: string;
  label: string;
  outletCode: string;
  outletName: string;
  costCents: number;
  priceCents: number;
  grade: string | null;
  batteryHealth: number | null;
  updatedAt: string;
};

export async function searchUnits(
  db: TenantTx,
  options: { q?: string; status?: UnitStatus; outletId?: string; variantId?: string; take?: number } = {},
): Promise<UnitListItem[]> {
  const q = options.q?.trim();
  const where: Prisma.StockUnitWhereInput = {
    status: options.status,
    outletId: options.outletId,
    variantId: options.variantId,
    ...(q
      ? {
          OR: [
            { imei: { contains: normalizeIdentifier(q) } },
            { imei2: { contains: normalizeIdentifier(q) } },
            { serialNumber: { contains: normalizeIdentifier(q), mode: "insensitive" } },
            { variant: { sku: { contains: q, mode: "insensitive" } } },
            { variant: { product: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const rows = await db.stockUnit.findMany({
    where,
    include: { variant: { include: { product: true } }, outlet: true },
    orderBy: { updatedAt: "desc" },
    take: options.take ?? 200,
  });
  return rows.map((u) => ({
    id: u.id,
    imei: u.imei,
    imei2: u.imei2,
    serialNumber: u.serialNumber,
    status: u.status,
    sku: u.variant.sku,
    label: variantLabel(u.variant.product.name, u.variant),
    outletCode: u.outlet.code,
    outletName: u.outlet.name,
    costCents: u.costCents,
    priceCents: u.priceCents ?? u.variant.priceCents,
    grade: u.grade,
    batteryHealth: u.batteryHealth,
    updatedAt: u.updatedAt.toISOString(),
  }));
}

/** Exact IMEI / IMEI 2 / serial lookup (scanner input). */
export async function findUnitByIdentifier(db: TenantTx, raw: string) {
  const id = normalizeIdentifier(raw);
  if (!id) return null;
  return db.stockUnit.findFirst({
    where: { OR: [{ imei: id }, { imei2: id }, { serialNumber: { equals: id, mode: "insensitive" } }] },
    include: { variant: { include: { product: true } }, outlet: true },
  });
}

export type AvailableUnit = {
  id: string;
  imei: string | null;
  serialNumber: string | null;
  grade: string | null;
  batteryHealth: number | null;
  priceCents: number;
  costCents: number;
};

export async function listAvailableUnits(
  db: TenantTx,
  options: { outletId: string; variantId: string },
): Promise<AvailableUnit[]> {
  const rows = await db.stockUnit.findMany({
    where: { outletId: options.outletId, variantId: options.variantId, status: "IN_STOCK" },
    include: { variant: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  return rows.map((u) => ({
    id: u.id,
    imei: u.imei,
    serialNumber: u.serialNumber,
    grade: u.grade,
    batteryHealth: u.batteryHealth,
    priceCents: u.priceCents ?? u.variant.priceCents,
    costCents: u.costCents,
  }));
}

export type UnitHistoryEvent = {
  id: string;
  at: string;
  fromStatus: UnitStatus | null;
  toStatus: UnitStatus;
  outlet: string | null;
  refType: string;
  refId: string;
  refNo: string;
  note: string | null;
  user: string | null;
};

export type UnitDetail = UnitListItem & {
  variantId: string;
  productId: string;
  notes: string | null;
  supplierName: string | null;
  receivedAt: string | null;
  events: UnitHistoryEvent[];
  sales: { saleId: string; number: string; at: string; customer: string | null; totalCents: number }[];
};

/** Full IMEI lifecycle: purchase → transfers → sale → refund → ... */
export async function getUnitDetail(db: TenantTx, id: string): Promise<UnitDetail> {
  const u = await db.stockUnit.findUnique({
    where: { id },
    include: {
      variant: { include: { product: true } },
      outlet: true,
      goodsReceiptItem: { include: { goodsReceipt: { include: { supplier: true } } } },
      events: { orderBy: { createdAt: "asc" }, include: { user: true, outlet: true } },
      saleItems: { include: { sale: { include: { customer: true } } }, orderBy: { sale: { createdAt: "asc" } } },
    },
  });
  if (!u) throw new NotFoundError("IMEI unit not found");
  const receipt = u.goodsReceiptItem?.goodsReceipt ?? null;
  return {
    id: u.id,
    imei: u.imei,
    imei2: u.imei2,
    serialNumber: u.serialNumber,
    status: u.status,
    sku: u.variant.sku,
    label: variantLabel(u.variant.product.name, u.variant),
    outletCode: u.outlet.code,
    outletName: u.outlet.name,
    costCents: u.costCents,
    priceCents: u.priceCents ?? u.variant.priceCents,
    grade: u.grade,
    batteryHealth: u.batteryHealth,
    updatedAt: u.updatedAt.toISOString(),
    variantId: u.variantId,
    productId: u.variant.productId,
    notes: u.notes,
    supplierName: receipt?.supplier.name ?? null,
    receivedAt: receipt ? receipt.receivedAt.toISOString() : null,
    events: u.events.map((e) => ({
      id: e.id,
      at: e.createdAt.toISOString(),
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      outlet: e.outlet ? `${e.outlet.code} · ${e.outlet.name}` : null,
      refType: e.refType,
      refId: e.refId,
      refNo: e.refNo,
      note: e.note,
      user: e.user?.name ?? null,
    })),
    sales: u.saleItems.map((si) => ({
      saleId: si.saleId,
      number: si.sale.number,
      at: si.sale.createdAt.toISOString(),
      customer: si.sale.customer ? `${si.sale.customer.name}${si.sale.customer.phone ? ` (${si.sale.customer.phone})` : ""}` : null,
      totalCents: si.totalCents,
    })),
  };
}

// ───────────── ledger ─────────────

export type MovementListItem = {
  id: string;
  at: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  unitCostCents: number;
  outletCode: string;
  sku: string;
  label: string;
  imei: string | null;
  refType: string;
  refId: string;
  refNo: string;
  note: string | null;
  user: string | null;
};

export async function listMovements(
  db: TenantTx,
  options: { outletId?: string; variantId?: string; from?: Date; to?: Date; q?: string; take?: number } = {},
): Promise<MovementListItem[]> {
  const q = options.q?.trim();
  const rows = await db.inventoryMovement.findMany({
    where: {
      outletId: options.outletId,
      variantId: options.variantId,
      createdAt: options.from || options.to ? { gte: options.from, lt: options.to } : undefined,
      ...(q
        ? {
            OR: [
              { refNo: { contains: q, mode: "insensitive" } },
              { variant: { sku: { contains: q, mode: "insensitive" } } },
              { variant: { product: { name: { contains: q, mode: "insensitive" } } } },
              { stockUnit: { imei: { contains: normalizeIdentifier(q) } } },
            ],
          }
        : {}),
    },
    include: { outlet: true, variant: { include: { product: true } }, stockUnit: true, user: true },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 300,
  });
  return rows.map((m) => ({
    id: m.id,
    at: m.createdAt.toISOString(),
    type: m.type,
    quantity: m.quantity,
    balanceAfter: m.balanceAfter,
    unitCostCents: m.unitCostCents,
    outletCode: m.outlet.code,
    sku: m.variant.sku,
    label: variantLabel(m.variant.product.name, m.variant),
    imei: m.stockUnit?.imei ?? m.stockUnit?.serialNumber ?? null,
    refType: m.refType,
    refId: m.refId,
    refNo: m.refNo,
    note: m.note,
    user: m.user?.name ?? null,
  }));
}

export type AdjustmentListItem = {
  id: string;
  number: string;
  at: string;
  outletCode: string;
  reason: string;
  note: string | null;
  user: string;
};

export async function listAdjustments(db: TenantTx, take = 50): Promise<AdjustmentListItem[]> {
  const rows = await db.stockAdjustment.findMany({
    include: { outlet: true, createdBy: true },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((a) => ({
    id: a.id,
    number: a.number,
    at: a.createdAt.toISOString(),
    outletCode: a.outlet.code,
    reason: a.reason,
    note: a.note,
    user: a.createdBy.name,
  }));
}
