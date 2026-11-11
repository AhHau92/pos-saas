import type { Metadata } from "next";
import { requireTenantContext } from "@/lib/auth/context";
import { formatMoney } from "@/lib/money";
import { firstParam, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { getSaleDetail } from "@/modules/sales";
import { getBusinessProfile } from "@/modules/settings";
import { PrintControls } from "./print-controls";

export const metadata: Metadata = { title: "Receipt" };

/** 80 mm thermal receipt. Opened in a new tab from the POS; ?print=1 opens the print dialog. */
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const ctx = await requireTenantContext();
  const { id } = await params;
  const sp = await searchParams;
  const [profile, sale] = await Promise.all([getBusinessProfile(ctx.db), getSaleDetail(ctx.db, id)]);
  const money = (c: number) => formatMoney(c, profile.currency);
  const rate = sale.taxRateBps / 100;

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <PrintControls autoPrint={firstParam(sp.print) === "1"} />
      <div className="mx-auto w-[80mm] bg-white px-3 py-4 font-mono text-[11px] leading-snug text-black shadow print:shadow-none">
        <div className="text-center">
          <div className="text-sm font-bold">{profile.name}</div>
          {profile.registrationNo ? <div>UEN: {profile.registrationNo}</div> : null}
          {profile.taxRegistrationNo ? (
            <div>
              {profile.taxName} Reg No: {profile.taxRegistrationNo}
            </div>
          ) : null}
          <div className="mt-1">{sale.outlet.name}</div>
          {sale.outlet.address ? <div>{sale.outlet.address}</div> : null}
          {sale.outlet.phone ? <div>Tel: {sale.outlet.phone}</div> : null}
          <div className="mt-2 text-xs font-bold">{profile.taxRegistrationNo ? "TAX INVOICE" : "RECEIPT"}</div>
        </div>

        <div className="my-2 border-t border-dashed border-black" />
        <div className="flex justify-between">
          <span>No: {sale.number}</span>
        </div>
        <div>Date: {formatDateTime(sale.createdAt)}</div>
        <div>Cashier: {sale.cashier}</div>
        {sale.customer ? (
          <div>
            Customer: {sale.customer.name}
            {sale.customer.phone ? ` (${sale.customer.phone})` : ""}
          </div>
        ) : null}
        <div className="my-2 border-t border-dashed border-black" />

        {sale.items.map((item) => (
          <div key={item.id} className="mb-1.5">
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
        {!sale.taxInclusive ? (
          <>
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{money(sale.subtotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>
                {profile.taxName} {rate}%
              </span>
              <span>{money(sale.taxCents)}</span>
            </div>
          </>
        ) : null}
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{money(sale.totalCents)}</span>
        </div>
        {sale.taxInclusive && sale.taxRateBps > 0 ? (
          <div className="flex justify-between">
            <span>
              Incl. {profile.taxName} {rate}%
            </span>
            <span>{money(sale.taxCents)}</span>
          </div>
        ) : null}

        <div className="my-2 border-t border-dashed border-black" />
        {sale.payments.map((p) => (
          <div key={p.id} className="flex justify-between">
            <span>{p.methodName}</span>
            <span>{money(p.tenderedCents ?? p.amountCents)}</span>
          </div>
        ))}
        {sale.changeCents > 0 ? (
          <div className="flex justify-between font-bold">
            <span>Change</span>
            <span>{money(sale.changeCents)}</span>
          </div>
        ) : null}
        {sale.refundedCents > 0 ? (
          <div className="mt-1 flex justify-between">
            <span>Refunded</span>
            <span>-{money(sale.refundedCents)}</span>
          </div>
        ) : null}

        <div className="my-2 border-t border-dashed border-black" />
        {profile.receiptFooter ? <div className="whitespace-pre-line text-center">{profile.receiptFooter}</div> : null}
        <div className="mt-2 text-center">Thank you!</div>
      </div>
    </div>
  );
}
