import type { TenantTx } from "@/lib/db/tenant";
import { NotFoundError } from "@/lib/errors";
import { getBusinessProfile } from "@/modules/settings";
import { buildReceiptHeader, parseReceiptHeader, type ReceiptData } from "./receipt";

function findSaleForReceipt(db: TenantTx, where: { id: string } | { receiptToken: string }) {
  return db.sale.findUnique({
    where,
    include: {
      outlet: true,
      cashier: true,
      customer: true,
      items: { orderBy: { id: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
}

/** Everything printed on a receipt, from the sale's snapshots. */
export async function getReceiptData(db: TenantTx, saleId: string): Promise<ReceiptData> {
  const sale = await findSaleForReceipt(db, { id: saleId });
  if (!sale) throw new NotFoundError("Sale not found");
  return toReceiptData(db, sale);
}

/** Customer e-receipt link (/r/<shop>/<token>). Returns null for an unknown token. */
export async function getReceiptDataByToken(db: TenantTx, token: string): Promise<ReceiptData | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const sale = await findSaleForReceipt(db, { receiptToken: token });
  return sale ? toReceiptData(db, sale) : null;
}

type SaleWithReceiptRelations = {
  id: string;
  number: string;
  createdAt: Date;
  status: ReceiptData["status"];
  receiptHeader: unknown;
  currency: string;
  taxName: string;
  taxRateBps: number;
  taxInclusive: boolean;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  changeCents: number;
  refundedCents: number;
  printCount: number;
  outlet: { code: string; name: string; address: string | null; phone: string | null };
  cashier: { name: string };
  customer: { name: string; phone: string | null; email: string | null } | null;
  items: {
    description: string;
    imei: string | null;
    quantity: number;
    unitPriceCents: number;
    discountCents: number;
    totalCents: number;
  }[];
  payments: { methodName: string; amountCents: number; tenderedCents: number | null }[];
};

async function toReceiptData(db: TenantTx, sale: SaleWithReceiptRelations): Promise<ReceiptData> {
  const snapshot = parseReceiptHeader(sale.receiptHeader);
  const header =
    snapshot ??
    buildReceiptHeader({ profile: await getBusinessProfile(db), outlet: sale.outlet, cashierName: sale.cashier.name });
  return {
    saleId: sale.id,
    number: sale.number,
    createdAt: sale.createdAt.toISOString(),
    status: sale.status,
    header,
    headerSnapshot: snapshot !== null,
    currency: sale.currency,
    taxName: sale.taxName,
    taxRateBps: sale.taxRateBps,
    taxInclusive: sale.taxInclusive,
    customer: sale.customer ? { name: sale.customer.name, phone: sale.customer.phone, email: sale.customer.email } : null,
    items: sale.items.map((i) => ({
      description: i.description,
      imei: i.imei,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      discountCents: i.discountCents,
      totalCents: i.totalCents,
    })),
    subtotalCents: sale.subtotalCents,
    discountCents: sale.discountCents,
    taxCents: sale.taxCents,
    totalCents: sale.totalCents,
    changeCents: sale.changeCents,
    refundedCents: sale.refundedCents,
    payments: sale.payments.map((p) => ({ methodName: p.methodName, amountCents: p.amountCents, tenderedCents: p.tenderedCents })),
    printCount: sale.printCount,
  };
}
