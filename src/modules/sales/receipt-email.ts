/**
 * E-receipt email (HTML + plain text). Pure module — unit tested.
 * Email clients ignore <style> blocks and external CSS, so everything is inline and table-based.
 */
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { formatTaxRate, maskPhone, receiptTitle, type ReceiptData } from "./receipt";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes and keeps line breaks (addresses, receipt footer). */
function multiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

export function receiptEmailSubject(receipt: ReceiptData): string {
  const kind = receiptTitle(receipt) === "TAX INVOICE" ? "tax invoice" : "receipt";
  return `Your ${kind} from ${receipt.header.businessName} — ${receipt.number}`;
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MUTED = "color:#64748b";

function row(label: string, value: string, options: { bold?: boolean; size?: number; color?: string } = {}): string {
  const style = [
    "padding:3px 0",
    options.bold ? "font-weight:700" : "",
    options.size ? `font-size:${options.size}px` : "",
    options.color ? `color:${options.color}` : "",
  ]
    .filter(Boolean)
    .join(";");
  return `<tr><td style="${style}">${label}</td><td align="right" style="${style};white-space:nowrap">${value}</td></tr>`;
}

export function receiptEmailHtml(receipt: ReceiptData, options: { link?: string | null } = {}): string {
  const money = (cents: number) => escapeHtml(formatMoney(cents, receipt.currency));
  const h = receipt.header;
  const rate = formatTaxRate(receipt.taxRateBps);
  const title = receiptTitle(receipt);

  const headerLines = [
    h.outletName !== h.businessName ? escapeHtml(h.outletName) : null,
    h.outletAddress ? multiline(h.outletAddress) : null,
    h.outletPhone ? `Tel: ${escapeHtml(h.outletPhone)}` : null,
    h.registrationNo ? `UEN: ${escapeHtml(h.registrationNo)}` : null,
    h.taxRegistrationNo ? `${escapeHtml(receipt.taxName)} Reg No: ${escapeHtml(h.taxRegistrationNo)}` : null,
  ].filter(Boolean);

  const items = receipt.items
    .map((item) => {
      const details = [
        item.imei ? `IMEI/SN: <span style="font-family:Menlo,Consolas,monospace">${escapeHtml(item.imei)}</span>` : null,
        `${item.quantity} × ${money(item.unitPriceCents)}`,
        item.discountCents > 0 ? `Discount −${money(item.discountCents)}` : null,
      ]
        .filter(Boolean)
        .join("<br>");
      return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;vertical-align:top">
    <div style="font-weight:600;color:#0f172a">${escapeHtml(item.description)}</div>
    <div style="font-size:13px;${MUTED};margin-top:2px">${details}</div>
  </td>
  <td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:nowrap">${money(item.totalCents)}</td>
</tr>`;
    })
    .join("\n");

  const totals = [
    !receipt.taxInclusive ? row("Subtotal", money(receipt.subtotalCents)) : "",
    !receipt.taxInclusive && receipt.taxRateBps > 0 ? row(`${escapeHtml(receipt.taxName)} ${rate}%`, money(receipt.taxCents)) : "",
    row("Total", money(receipt.totalCents), { bold: true, size: 17, color: "#0f172a" }),
    receipt.taxInclusive && receipt.taxRateBps > 0
      ? row(`Incl. ${escapeHtml(receipt.taxName)} ${rate}%`, money(receipt.taxCents), { color: "#64748b" })
      : "",
    ...receipt.payments.map((p) => row(escapeHtml(p.methodName), money(p.tenderedCents ?? p.amountCents), { color: "#334155" })),
    receipt.changeCents > 0 ? row("Change", money(receipt.changeCents), { color: "#334155" }) : "",
    receipt.refundedCents > 0 ? row("Refunded", `−${money(receipt.refundedCents)}`, { color: "#be123c" }) : "",
  ].join("");

  const customerPhone = maskPhone(receipt.customer?.phone);
  const meta = [
    `${title === "TAX INVOICE" ? "Tax invoice" : "Receipt"} <strong>${escapeHtml(receipt.number)}</strong>`,
    escapeHtml(formatDateTime(receipt.createdAt)),
    h.cashierName ? `Served by ${escapeHtml(h.cashierName)}` : null,
    receipt.customer ? `Customer: ${escapeHtml(receipt.customer.name)}${customerPhone ? ` (${escapeHtml(customerPhone)})` : ""}` : null,
  ]
    .filter(Boolean)
    .join("<br>");

  const button = options.link
    ? `<tr><td align="center" style="padding:20px 24px 4px">
  <a href="${escapeHtml(options.link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">View / save receipt (PDF)</a>
</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(receiptEmailSubject(receipt))}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;${FONT};color:#0f172a">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(`${receipt.number} · Total ${formatMoney(receipt.totalCents, receipt.currency)}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
  <tr><td style="padding:24px 24px 8px;text-align:center">
    <div style="font-size:20px;font-weight:700">${escapeHtml(h.businessName)}</div>
    <div style="font-size:13px;${MUTED};margin-top:4px;line-height:1.5">${headerLines.join("<br>")}</div>
  </td></tr>
  <tr><td style="padding:12px 24px;font-size:14px;line-height:1.6;border-top:1px solid #e2e8f0">${meta}</td></tr>
  <tr><td style="padding:0 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${items}</table>
  </td></tr>
  <tr><td style="padding:12px 24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${totals}</table>
  </td></tr>
  ${button}
  ${h.receiptFooter ? `<tr><td style="padding:16px 24px 0;font-size:13px;${MUTED};text-align:center;line-height:1.5">${multiline(h.receiptFooter)}</td></tr>` : ""}
  <tr><td style="padding:16px 24px 24px;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5">
    Thank you for shopping with us! Keep this email as proof of purchase (the IMEI is your warranty reference).<br>
    Questions? Just reply to this email.
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function receiptEmailText(receipt: ReceiptData, options: { link?: string | null } = {}): string {
  const money = (cents: number) => formatMoney(cents, receipt.currency);
  const h = receipt.header;
  const rate = formatTaxRate(receipt.taxRateBps);
  const lines: string[] = [h.businessName];
  if (h.outletName !== h.businessName) lines.push(h.outletName);
  if (h.outletAddress) lines.push(h.outletAddress);
  if (h.outletPhone) lines.push(`Tel: ${h.outletPhone}`);
  if (h.registrationNo) lines.push(`UEN: ${h.registrationNo}`);
  if (h.taxRegistrationNo) lines.push(`${receipt.taxName} Reg No: ${h.taxRegistrationNo}`);
  lines.push("");
  lines.push(`${receiptTitle(receipt) === "TAX INVOICE" ? "Tax invoice" : "Receipt"} ${receipt.number}`);
  lines.push(formatDateTime(receipt.createdAt));
  if (h.cashierName) lines.push(`Served by ${h.cashierName}`);
  lines.push("");
  for (const item of receipt.items) {
    lines.push(item.description);
    if (item.imei) lines.push(`  IMEI/SN: ${item.imei}`);
    lines.push(`  ${item.quantity} x ${money(item.unitPriceCents)}${item.discountCents > 0 ? `, discount -${money(item.discountCents)}` : ""} = ${money(item.totalCents)}`);
  }
  lines.push("");
  if (!receipt.taxInclusive) {
    lines.push(`Subtotal: ${money(receipt.subtotalCents)}`);
    if (receipt.taxRateBps > 0) lines.push(`${receipt.taxName} ${rate}%: ${money(receipt.taxCents)}`);
  }
  lines.push(`TOTAL: ${money(receipt.totalCents)}`);
  if (receipt.taxInclusive && receipt.taxRateBps > 0) lines.push(`Incl. ${receipt.taxName} ${rate}%: ${money(receipt.taxCents)}`);
  for (const p of receipt.payments) lines.push(`${p.methodName}: ${money(p.tenderedCents ?? p.amountCents)}`);
  if (receipt.changeCents > 0) lines.push(`Change: ${money(receipt.changeCents)}`);
  if (receipt.refundedCents > 0) lines.push(`Refunded: -${money(receipt.refundedCents)}`);
  if (options.link) {
    lines.push("");
    lines.push(`View / save your receipt: ${options.link}`);
  }
  if (h.receiptFooter) {
    lines.push("");
    lines.push(h.receiptFooter);
  }
  lines.push("");
  lines.push("Thank you for shopping with us!");
  return lines.join("\n");
}
