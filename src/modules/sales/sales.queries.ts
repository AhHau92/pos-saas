import type { Prisma } from "@/generated/tenant/client";
import type { TenantTx } from "@/lib/db/tenant";
import { NotFoundError } from "@/lib/errors";
import { normalizeIdentifier } from "@/modules/inventory";

export type SaleStatusValue = "COMPLETED" | "PARTIALLY_REFUNDED" | "REFUNDED";

export type SaleListItem = {
  id: string;
  number: string;
  status: SaleStatusValue;
  outletCode: string;
  cashier: string;
  customer: string | null;
  itemCount: number;
  totalCents: number;
  refundedCents: number;
  createdAt: string;
};

export async function listSales(
  db: TenantTx,
  options: { outletId?: string; from?: Date; to?: Date; q?: string; take?: number } = {},
): Promise<SaleListItem[]> {
  const q = options.q?.trim();
  const where: Prisma.SaleWhereInput = {
    outletId: options.outletId,
    createdAt: options.from || options.to ? { gte: options.from, lt: options.to } : undefined,
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { customer: { phone: { contains: q } } },
            { items: { some: { imei: { contains: normalizeIdentifier(q) } } } },
          ],
        }
      : {}),
  };
  const rows = await db.sale.findMany({
    where,
    include: { outlet: true, cashier: true, customer: true, items: true },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 200,
  });
  return rows.map((s) => ({
    id: s.id,
    number: s.number,
    status: s.status,
    outletCode: s.outlet.code,
    cashier: s.cashier.name,
    customer: s.customer ? s.customer.name : null,
    itemCount: s.items.reduce((sum, i) => sum + i.quantity, 0),
    totalCents: s.totalCents,
    refundedCents: s.refundedCents,
    createdAt: s.createdAt.toISOString(),
  }));
}

export type SaleDetail = {
  id: string;
  number: string;
  status: SaleStatusValue;
  createdAt: string;
  outlet: { id: string; code: string; name: string; address: string | null; phone: string | null };
  cashier: string;
  customer: { name: string; phone: string | null; email: string | null } | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  changeCents: number;
  refundedCents: number;
  taxRateBps: number;
  taxInclusive: boolean;
  notes: string | null;
  items: {
    id: string;
    variantId: string;
    stockUnitId: string | null;
    description: string;
    sku: string;
    imei: string | null;
    quantity: number;
    unitPriceCents: number;
    discountCents: number;
    taxCents: number;
    totalCents: number;
    unitCostCents: number;
    refundedQuantity: number;
    refundedCents: number;
  }[];
  payments: { id: string; methodName: string; amountCents: number; tenderedCents: number | null; reference: string | null }[];
  refunds: {
    id: string;
    number: string;
    createdAt: string;
    methodName: string;
    totalCents: number;
    reason: string | null;
    createdBy: string;
    items: { description: string; quantity: number; amountCents: number; disposition: string }[];
  }[];
};

export async function getSaleDetail(db: TenantTx, id: string): Promise<SaleDetail> {
  const s = await db.sale.findUnique({
    where: { id },
    include: {
      outlet: true,
      cashier: true,
      customer: true,
      items: { orderBy: { id: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
      refunds: {
        orderBy: { createdAt: "asc" },
        include: { createdBy: true, items: { include: { saleItem: true } } },
      },
    },
  });
  if (!s) throw new NotFoundError("Sale not found");
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    outlet: { id: s.outlet.id, code: s.outlet.code, name: s.outlet.name, address: s.outlet.address, phone: s.outlet.phone },
    cashier: s.cashier.name,
    customer: s.customer ? { name: s.customer.name, phone: s.customer.phone, email: s.customer.email } : null,
    subtotalCents: s.subtotalCents,
    discountCents: s.discountCents,
    taxCents: s.taxCents,
    totalCents: s.totalCents,
    paidCents: s.paidCents,
    changeCents: s.changeCents,
    refundedCents: s.refundedCents,
    taxRateBps: s.taxRateBps,
    taxInclusive: s.taxInclusive,
    notes: s.notes,
    items: s.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      stockUnitId: i.stockUnitId,
      description: i.description,
      sku: i.sku,
      imei: i.imei,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      discountCents: i.discountCents,
      taxCents: i.taxCents,
      totalCents: i.totalCents,
      unitCostCents: i.unitCostCents,
      refundedQuantity: i.refundedQuantity,
      refundedCents: i.refundedCents,
    })),
    payments: s.payments.map((p) => ({
      id: p.id,
      methodName: p.methodName,
      amountCents: p.amountCents,
      tenderedCents: p.tenderedCents,
      reference: p.reference,
    })),
    refunds: s.refunds.map((r) => ({
      id: r.id,
      number: r.number,
      createdAt: r.createdAt.toISOString(),
      methodName: r.methodName,
      totalCents: r.totalCents,
      reason: r.reason,
      createdBy: r.createdBy.name,
      items: r.items.map((ri) => ({
        description: ri.saleItem.description,
        quantity: ri.quantity,
        amountCents: ri.amountCents,
        disposition: ri.disposition,
      })),
    })),
  };
}
