import type { Prisma } from "@/generated/tenant/client";
import type { TenantTx } from "@/lib/db/tenant";
import { NotFoundError } from "@/lib/errors";
import { failedChecks, maskIdNumber, type SellerIdType, type TradeInChecklist } from "./tradein";

export type TradeInListItem = {
  id: string;
  number: string;
  createdAt: string;
  outletCode: string;
  sellerName: string;
  devices: number;
  totalCents: number;
  settlement: "PAYOUT" | "SALE_CREDIT";
  /** "Cash" / "PayNow" … or the sale number it paid for */
  settledWith: string;
};

export async function listTradeIns(
  db: TenantTx,
  options: { outletId?: string; q?: string; take?: number } = {},
): Promise<TradeInListItem[]> {
  const q = options.q?.trim();
  const where: Prisma.TradeInWhereInput = {
    outletId: options.outletId,
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { sellerName: { contains: q, mode: "insensitive" } },
            { sellerPhone: { contains: q } },
            { bookingRef: { contains: q, mode: "insensitive" } },
            { items: { some: { identifier: { contains: q.toUpperCase().replace(/[\s-]/g, "") } } } },
          ],
        }
      : {}),
  };
  const rows = await db.tradeIn.findMany({
    where,
    include: { outlet: true, sale: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 200,
  });
  return rows.map((t) => ({
    id: t.id,
    number: t.number,
    createdAt: t.createdAt.toISOString(),
    outletCode: t.outlet.code,
    sellerName: t.sellerName,
    devices: t._count.items,
    totalCents: t.totalCents,
    settlement: t.settlement,
    settledWith: t.settlement === "SALE_CREDIT" ? `Sale ${t.sale?.number ?? ""}`.trim() : (t.paymentMethodName ?? "—"),
  }));
}

export type TradeInDetail = {
  id: string;
  number: string;
  createdAt: string;
  outlet: { id: string; code: string; name: string; address: string | null; phone: string | null };
  createdBy: string;
  seller: {
    name: string;
    phone: string | null;
    idType: SellerIdType | null;
    /** Full number only when `showIdentity` was requested */
    idNumber: string | null;
    idNumberMasked: string | null;
    address: string | null;
  };
  policeScreened: boolean;
  policeReference: string | null;
  bookingRef: string | null;
  totalCents: number;
  settlement: "PAYOUT" | "SALE_CREDIT";
  paymentMethodName: string | null;
  payoutReference: string | null;
  sale: { id: string; number: string } | null;
  notes: string | null;
  items: {
    id: string;
    description: string;
    identifier: string;
    stockUnitId: string;
    grade: string | null;
    batteryHealth: number | null;
    issues: string[];
    priceCents: number;
  }[];
};

export async function getTradeInDetail(db: TenantTx, id: string, options: { showIdentity?: boolean } = {}): Promise<TradeInDetail> {
  const t = await db.tradeIn.findUnique({
    where: { id },
    include: { outlet: true, createdBy: true, sale: true, items: { orderBy: { id: "asc" } } },
  });
  if (!t) throw new NotFoundError("Trade-in not found");
  return {
    id: t.id,
    number: t.number,
    createdAt: t.createdAt.toISOString(),
    outlet: { id: t.outlet.id, code: t.outlet.code, name: t.outlet.name, address: t.outlet.address, phone: t.outlet.phone },
    createdBy: t.createdBy.name,
    seller: {
      name: t.sellerName,
      phone: t.sellerPhone,
      idType: t.sellerIdType,
      idNumber: options.showIdentity ? t.sellerIdNumber : null,
      idNumberMasked: maskIdNumber(t.sellerIdNumber),
      address: t.sellerAddress,
    },
    policeScreened: t.policeScreened,
    policeReference: t.policeReference,
    bookingRef: t.bookingRef,
    totalCents: t.totalCents,
    settlement: t.settlement,
    paymentMethodName: t.paymentMethodName,
    payoutReference: t.payoutReference,
    sale: t.sale ? { id: t.sale.id, number: t.sale.number } : null,
    notes: t.notes,
    items: t.items.map((i) => ({
      id: i.id,
      description: i.description,
      identifier: i.identifier,
      stockUnitId: i.stockUnitId,
      grade: i.grade,
      batteryHealth: i.batteryHealth,
      issues: failedChecks(i.checklist as TradeInChecklist | null),
      priceCents: i.priceCents,
    })),
  };
}
