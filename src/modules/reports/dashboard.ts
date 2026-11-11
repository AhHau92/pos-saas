/**
 * Read-only reporting queries (may read across modules' tables, never writes).
 */
import type { TenantTx } from "@/lib/db/tenant";
import { startOfDay } from "@/lib/time";
import { listLowStock, type LowStockItem } from "@/modules/inventory";

export type DashboardData = {
  scope: "outlet" | "all";
  today: {
    salesCount: number;
    salesCents: number;
    refundsCents: number;
    netCents: number;
    grossProfitCents: number;
    itemsSold: number;
  };
  paymentsByMethod: { methodName: string; amountCents: number }[];
  byOutlet: { outletId: string; outletCode: string; salesCount: number; salesCents: number }[];
  stock: { serializedUnits: number; quantityItems: number; costValueCents: number };
  lowStock: LowStockItem[];
  incomingTransfers: { id: string; number: string; fromOutlet: string; dispatchedAt: string | null; quantity: number }[];
  recentSales: { id: string; number: string; totalCents: number; createdAt: string; cashier: string; status: string }[];
};

export async function getDashboard(
  db: TenantTx,
  options: { outletId: string; allOutlets: boolean; now?: Date },
): Promise<DashboardData> {
  const start = startOfDay(options.now ?? new Date());
  const outletFilter = options.allOutlets ? {} : { outletId: options.outletId };
  const salesWhere = { ...outletFilter, createdAt: { gte: start } };

  const [sales, refunds, payments, outlets, units, levels, lowStock, incoming, recent] = await Promise.all([
    db.sale.findMany({ where: salesWhere, include: { items: true } }),
    db.refund.findMany({ where: { ...outletFilter, createdAt: { gte: start } } }),
    db.payment.findMany({ where: { sale: salesWhere } }),
    db.outlet.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    db.stockUnit.aggregate({
      where: { status: "IN_STOCK", ...outletFilter },
      _sum: { costCents: true },
      _count: { _all: true },
    }),
    db.stockLevel.findMany({
      where: { ...outletFilter, quantity: { gt: 0 }, variant: { product: { type: "NON_SERIALIZED" } } },
      include: { variant: true },
    }),
    listLowStock(db, options.outletId, 10),
    db.stockTransfer.findMany({
      where: { status: "IN_TRANSIT", toOutletId: options.outletId },
      include: { fromOutlet: true, items: true },
      orderBy: { dispatchedAt: "asc" },
      take: 10,
    }),
    db.sale.findMany({
      where: outletFilter,
      include: { cashier: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const salesCents = sales.reduce((s, x) => s + x.totalCents, 0);
  const refundsCents = refunds.reduce((s, x) => s + x.totalCents, 0);
  let grossProfitCents = 0;
  let itemsSold = 0;
  for (const sale of sales) {
    for (const item of sale.items) {
      // revenue excluding tax minus cost of goods
      grossProfitCents += item.totalCents - item.taxCents - item.unitCostCents * item.quantity;
      itemsSold += item.quantity;
    }
  }

  const byMethod = new Map<string, number>();
  for (const p of payments) byMethod.set(p.methodName, (byMethod.get(p.methodName) ?? 0) + p.amountCents);

  const byOutlet = outlets.map((o) => {
    const own = sales.filter((s) => s.outletId === o.id);
    return {
      outletId: o.id,
      outletCode: o.code,
      salesCount: own.length,
      salesCents: own.reduce((s, x) => s + x.totalCents, 0),
    };
  });

  return {
    scope: options.allOutlets ? "all" : "outlet",
    today: {
      salesCount: sales.length,
      salesCents,
      refundsCents,
      netCents: salesCents - refundsCents,
      grossProfitCents,
      itemsSold,
    },
    paymentsByMethod: [...byMethod.entries()]
      .map(([methodName, amountCents]) => ({ methodName, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents),
    byOutlet: options.allOutlets ? byOutlet : [],
    stock: {
      serializedUnits: Number(units._count?._all ?? 0),
      quantityItems: levels.reduce((s, l) => s + l.quantity, 0),
      costValueCents:
        Number(units._sum?.costCents ?? 0) + levels.reduce((s, l) => s + l.quantity * l.variant.costCents, 0),
    },
    lowStock,
    incomingTransfers: incoming.map((t) => ({
      id: t.id,
      number: t.number,
      fromOutlet: t.fromOutlet.code,
      dispatchedAt: t.dispatchedAt ? t.dispatchedAt.toISOString() : null,
      quantity: t.items.reduce((s, i) => s + i.quantity, 0),
    })),
    recentSales: recent.map((s) => ({
      id: s.id,
      number: s.number,
      totalCents: s.totalCents,
      createdAt: s.createdAt.toISOString(),
      cashier: s.cashier.name,
      status: s.status,
    })),
  };
}
