import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { formatTaxRate, maskPhone, receiptTitle, type ReceiptData } from "@/modules/sales";

/**
 * 80 mm receipt layout. Used for printing (/receipt/[id]) and for the customer's
 * e-receipt page (/r/[shop]/[token]). Server component — no hooks.
 */
export function ReceiptView({
  receipt,
  reprint = false,
  maskCustomerPhone = false,
  note,
}: {
  receipt: ReceiptData;
  /** Printed before → "REPRINT" banner */
  reprint?: boolean;
  /** Receipts that leave the shop (e-receipt) show only the last 4 digits */
  maskCustomerPhone?: boolean;
  /** Small line under the title, e.g. "E-receipt" */
  note?: string;
}) {
  const money = (c: number) => formatMoney(c, receipt.currency);
  const h = receipt.header;
  const rate = formatTaxRate(receipt.taxRateBps);
  const customerPhone = maskCustomerPhone ? maskPhone(receipt.customer?.phone) : receipt.customer?.phone;

  return (
    <div className="mx-auto w-[80mm] bg-white px-3 py-4 font-mono text-[11px] leading-snug text-black shadow print:shadow-none">
      <div className="text-center">
        <div className="text-sm font-bold">{h.businessName}</div>
        {h.registrationNo ? <div>UEN: {h.registrationNo}</div> : null}
        {h.taxRegistrationNo ? (
          <div>
            {receipt.taxName} Reg No: {h.taxRegistrationNo}
          </div>
        ) : null}
        <div className="mt-1">{h.outletName}</div>
        {h.outletAddress ? <div className="whitespace-pre-line">{h.outletAddress}</div> : null}
        {h.outletPhone ? <div>Tel: {h.outletPhone}</div> : null}
        <div className="mt-2 text-xs font-bold">{receiptTitle(receipt)}</div>
        {note ? <div>{note}</div> : null}
        {reprint ? <div className="mt-1 border border-black py-0.5 text-xs font-bold">*** REPRINT ***</div> : null}
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <div>No: {receipt.number}</div>
      <div>Date: {formatDateTime(receipt.createdAt)}</div>
      {h.cashierName ? <div>Cashier: {h.cashierName}</div> : null}
      {receipt.customer ? (
        <div>
          Customer: {receipt.customer.name}
          {customerPhone ? ` (${customerPhone})` : ""}
        </div>
      ) : null}
      <div className="my-2 border-t border-dashed border-black" />

      {receipt.items.map((item, index) => (
        <div key={index} className="mb-1.5">
          <div>{item.description}</div>
          {item.imei ? <div>IMEI/SN: {item.imei}</div> : null}
          <div className="flex justify-between">
            <span>
              {item.quantity} x {money(item.unitPriceCents)}
            </span>
            <span>{money(item.unitPriceCents * item.quantity)}</span>
          </div>
          {item.discountCents > 0 ? (
            <div className="flex justify-between">
              <span>  Discount</span>
              <span>-{money(item.discountCents)}</span>
            </div>
          ) : null}
        </div>
      ))}

      <div className="my-2 border-t border-dashed border-black" />
      {!receipt.taxInclusive ? (
        <>
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(receipt.subtotalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>
              {receipt.taxName} {rate}%
            </span>
            <span>{money(receipt.taxCents)}</span>
          </div>
        </>
      ) : null}
      <div className="flex justify-between text-sm font-bold">
        <span>TOTAL</span>
        <span>{money(receipt.totalCents)}</span>
      </div>
      {receipt.taxInclusive && receipt.taxRateBps > 0 ? (
        <div className="flex justify-between">
          <span>
            Incl. {receipt.taxName} {rate}%
          </span>
          <span>{money(receipt.taxCents)}</span>
        </div>
      ) : null}

      <div className="my-2 border-t border-dashed border-black" />
      {receipt.payments.map((p, index) => (
        <div key={index} className="flex justify-between">
          <span>{p.methodName}</span>
          <span>{money(p.tenderedCents ?? p.amountCents)}</span>
        </div>
      ))}
      {receipt.changeCents > 0 ? (
        <div className="flex justify-between font-bold">
          <span>Change</span>
          <span>{money(receipt.changeCents)}</span>
        </div>
      ) : null}
      {receipt.refundedCents > 0 ? (
        <div className="mt-1 flex justify-between">
          <span>Refunded</span>
          <span>-{money(receipt.refundedCents)}</span>
        </div>
      ) : null}

      <div className="my-2 border-t border-dashed border-black" />
      {h.receiptFooter ? <div className="whitespace-pre-line text-center">{h.receiptFooter}</div> : null}
      <div className="mt-2 text-center">Thank you!</div>
    </div>
  );
}
