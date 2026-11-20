/**
 * Receipt content. Pure module (used by the printed receipt, the customer's e-receipt page,
 * the e-receipt email and the WhatsApp message).
 *
 * A receipt is a document that was handed to the customer: it must show what was true at the
 * time of sale. Lines, prices and tax were always snapshotted on Sale / SaleItem; the header
 * (business name, UEN, GST no., outlet address, footer, cashier) is snapshotted in
 * Sale.receiptHeader at checkout. Sales made before snapshots existed fall back to the
 * current settings (ReceiptData.headerSnapshot = false).
 */
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";

export type ReceiptHeader = {
  businessName: string;
  /** Company registration no. (UEN) */
  registrationNo: string | null;
  /** GST registration no. */
  taxRegistrationNo: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  outletCode: string;
  outletName: string;
  outletAddress: string | null;
  outletPhone: string | null;
  cashierName: string;
  receiptFooter: string | null;
};

export function buildReceiptHeader(input: {
  profile: {
    name: string;
    registrationNo: string | null;
    taxRegistrationNo: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    receiptFooter: string | null;
  };
  outlet: { code: string; name: string; address: string | null; phone: string | null };
  cashierName: string;
}): ReceiptHeader {
  const { profile, outlet } = input;
  return {
    businessName: profile.name,
    registrationNo: profile.registrationNo,
    taxRegistrationNo: profile.taxRegistrationNo,
    businessAddress: profile.address,
    businessPhone: profile.phone,
    businessEmail: profile.email,
    outletCode: outlet.code,
    outletName: outlet.name,
    outletAddress: outlet.address,
    outletPhone: outlet.phone,
    cashierName: input.cashierName,
    receiptFooter: profile.receiptFooter,
  };
}

/** Reads Sale.receiptHeader (JSON). Returns null for sales made before snapshots existed. */
export function parseReceiptHeader(value: unknown): ReceiptHeader | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const text = (key: string): string | null => (typeof v[key] === "string" ? (v[key] as string) : null);
  const businessName = text("businessName");
  const outletName = text("outletName");
  if (!businessName || !outletName) return null;
  return {
    businessName,
    registrationNo: text("registrationNo"),
    taxRegistrationNo: text("taxRegistrationNo"),
    businessAddress: text("businessAddress"),
    businessPhone: text("businessPhone"),
    businessEmail: text("businessEmail"),
    outletCode: text("outletCode") ?? "",
    outletName,
    outletAddress: text("outletAddress"),
    outletPhone: text("outletPhone"),
    cashierName: text("cashierName") ?? "",
    receiptFooter: text("receiptFooter"),
  };
}

export type ReceiptData = {
  saleId: string;
  number: string;
  /** ISO date-time */
  createdAt: string;
  status: "COMPLETED" | "PARTIALLY_REFUNDED" | "REFUNDED";
  header: ReceiptHeader;
  /** false = old sale without a snapshot; the header shows the current settings */
  headerSnapshot: boolean;
  currency: string;
  taxName: string;
  taxRateBps: number;
  taxInclusive: boolean;
  customer: { name: string; phone: string | null; email: string | null } | null;
  items: {
    description: string;
    /** IMEI or serial number */
    imei: string | null;
    quantity: number;
    unitPriceCents: number;
    discountCents: number;
    totalCents: number;
  }[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  changeCents: number;
  refundedCents: number;
  payments: { methodName: string; amountCents: number; tenderedCents: number | null }[];
  /** How many times the receipt was printed (0 = the next print is the original) */
  printCount: number;
};

/** GST-registered businesses issue tax invoices. */
export function receiptTitle(receipt: Pick<ReceiptData, "header">): "TAX INVOICE" | "RECEIPT" {
  return receipt.header.taxRegistrationNo ? "TAX INVOICE" : "RECEIPT";
}

/** 900 → "9", 850 → "8.5" */
export function formatTaxRate(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

/** Shows only the last 4 digits of a phone number, e.g. "••••4567" (receipts that leave the shop). */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `••••${digits.slice(-4)}`;
}

/** "jason@example.com" → "ja•••@example.com" */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}•••@${domain}`;
}

/**
 * Short plain-text receipt for WhatsApp (and the text part of the e-receipt email).
 * Contains the IMEI so the customer can use it for warranty claims.
 */
export function receiptText(receipt: ReceiptData, options: { link?: string | null } = {}): string {
  const money = (cents: number) => formatMoney(cents, receipt.currency);
  const h = receipt.header;
  const lines: string[] = [];
  lines.push(`${h.businessName} — ${receiptTitle(receipt) === "TAX INVOICE" ? "Tax invoice" : "Receipt"} ${receipt.number}`);
  lines.push(`${formatDateTime(receipt.createdAt)} · ${h.outletName}`);
  lines.push("");
  for (const item of receipt.items) {
    lines.push(`${item.quantity} x ${item.description} — ${money(item.totalCents)}`);
    if (item.imei) lines.push(`  IMEI/SN: ${item.imei}`);
    if (item.discountCents > 0) lines.push(`  (discount ${money(item.discountCents)})`);
  }
  lines.push("");
  lines.push(`Total: ${money(receipt.totalCents)}`);
  if (receipt.taxRateBps > 0) {
    lines.push(
      `${receipt.taxInclusive ? "Incl." : "Plus"} ${receipt.taxName} ${formatTaxRate(receipt.taxRateBps)}%: ${money(receipt.taxCents)}`,
    );
  }
  if (receipt.payments.length > 0) lines.push(`Paid by: ${receipt.payments.map((p) => p.methodName).join(", ")}`);
  if (receipt.refundedCents > 0) lines.push(`Refunded: ${money(receipt.refundedCents)}`);
  if (options.link) {
    lines.push("");
    lines.push(`View / download your receipt: ${options.link}`);
  }
  lines.push("");
  lines.push(`Thank you for shopping at ${h.businessName}!`);
  return lines.join("\n");
}
