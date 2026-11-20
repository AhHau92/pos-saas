import { randomBytes } from "node:crypto";
import { z } from "zod";
import { normalizeEmail, whatsappLink, whatsappNumber } from "@/lib/contact";
import type { TenantTx } from "@/lib/db/tenant";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import { describeMailError, isMailConfigured, sendMail } from "@/lib/mail";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { optionalEmail, parseInput } from "@/lib/validation";
import { getBusinessProfile } from "@/modules/settings";
import { receiptText } from "./receipt";
import { receiptEmailHtml, receiptEmailSubject, receiptEmailText } from "./receipt-email";
import { getReceiptData } from "./receipt.queries";

/** Unguessable token for the customer's e-receipt link (128 bits, URL-safe). */
export function newReceiptToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Sales made before e-receipts existed get their token on first use. */
export async function ensureReceiptToken(db: TenantTx, saleId: string): Promise<string> {
  const sale = await db.sale.findUnique({ where: { id: saleId }, select: { receiptToken: true } });
  if (!sale) throw new NotFoundError("Sale not found");
  if (sale.receiptToken) return sale.receiptToken;
  const token = newReceiptToken();
  await db.sale.updateMany({ where: { id: saleId, receiptToken: null }, data: { receiptToken: token } });
  const after = await db.sale.findUnique({ where: { id: saleId }, select: { receiptToken: true } });
  return after?.receiptToken ?? token;
}

/**
 * Counts a printed receipt. The first print is the original; every later print is marked
 * "REPRINT" so a duplicate cannot be passed off as a second original (refund / claim fraud).
 */
export async function recordReceiptPrint(ctx: ServiceContext, saleId: string): Promise<{ printCount: number }> {
  assertCan(ctx, "sales.view");
  const result = await ctx.db.sale.updateMany({ where: { id: saleId }, data: { printCount: { increment: 1 } } });
  if (result.count !== 1) throw new NotFoundError("Sale not found");
  const sale = await ctx.db.sale.findUnique({ where: { id: saleId }, select: { printCount: true } });
  return { printCount: sale?.printCount ?? 1 };
}

/** Where customer links point: `${origin}/r/${shop code}` — built by the caller (needs the request + tenant). */
export type ReceiptLinkBase = string | null;

export type ReceiptShare = {
  /** Customer's e-receipt page */
  link: string | null;
  /** wa.me click-to-chat link with the receipt text filled in (staff press Send — free, no API) */
  whatsappUrl: string;
  /** Customer's number in international format, or null (WhatsApp then asks who to send to) */
  whatsappTo: string | null;
  emailConfigured: boolean;
};

export async function getReceiptShare(ctx: ServiceContext, saleId: string, linkBase: ReceiptLinkBase): Promise<ReceiptShare> {
  assertCan(ctx, "sales.view");
  const token = await ensureReceiptToken(ctx.db, saleId);
  const [receipt, profile] = await Promise.all([getReceiptData(ctx.db, saleId), getBusinessProfile(ctx.db)]);
  const link = linkBase ? `${linkBase}/${token}` : null;
  const whatsappTo = whatsappNumber(receipt.customer?.phone, profile.phoneCountryCode);
  return {
    link,
    whatsappUrl: whatsappLink(receiptText(receipt, { link }), whatsappTo),
    whatsappTo,
    emailConfigured: isMailConfigured(),
  };
}

const emailSchema = z.object({
  /** Leave empty to use the address given at checkout / the customer's email */
  email: optionalEmail(),
});

/**
 * Emails the e-receipt (same content as the printed receipt, incl. IMEI) and logs the attempt.
 * Failures are logged too and returned as a readable error for the cashier.
 */
export async function emailReceipt(
  ctx: ServiceContext,
  saleId: string,
  input: unknown,
  linkBase: ReceiptLinkBase,
): Promise<{ sentTo: string }> {
  assertCan(ctx, "sales.view");
  const data = parseInput(emailSchema, input ?? {});
  const sale = await ctx.db.sale.findUnique({ where: { id: saleId }, include: { customer: true } });
  if (!sale) throw new NotFoundError("Sale not found");
  const to = data.email ? normalizeEmail(data.email) : (sale.receiptEmail ?? sale.customer?.email ?? null);
  if (!to) throw new ValidationError("Enter the customer's email address");
  if (!isMailConfigured()) {
    throw new AppError(503, "MAIL_NOT_CONFIGURED", "Email is not set up yet — the owner needs to add the SMTP settings (see Settings).");
  }

  const token = await ensureReceiptToken(ctx.db, saleId);
  const [receipt, profile] = await Promise.all([getReceiptData(ctx.db, saleId), getBusinessProfile(ctx.db)]);
  const link = linkBase ? `${linkBase}/${token}` : null;

  try {
    const info = await sendMail({
      to,
      subject: receiptEmailSubject(receipt),
      html: receiptEmailHtml(receipt, { link }),
      text: receiptEmailText(receipt, { link }),
      fromName: receipt.header.businessName,
      replyTo: profile.email ?? receipt.header.businessEmail,
    });
    await ctx.db.receiptEmail.create({
      data: { saleId, toEmail: to, status: "SENT", messageId: info.messageId, sentById: ctx.userId },
    });
  } catch (error) {
    const reason = describeMailError(error);
    console.error("[mail] e-receipt failed", sale.number, reason);
    await ctx.db.receiptEmail.create({
      data: { saleId, toEmail: to, status: "FAILED", error: reason.slice(0, 500), sentById: ctx.userId },
    });
    throw new AppError(502, "MAIL_FAILED", `E-receipt not sent: ${reason}`);
  }

  await ctx.db.sale.update({ where: { id: saleId }, data: { receiptEmail: to } });
  // remember the address for next time (never overwrites an existing one)
  if (sale.customer && !sale.customer.email) {
    await ctx.db.customer.update({ where: { id: sale.customer.id }, data: { email: to } });
  }
  return { sentTo: to };
}
