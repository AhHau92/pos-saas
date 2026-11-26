import type { Metadata } from "next";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { firstParam, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { getOutletTax } from "@/modules/outlets";
import { getTradeInDetail, SELLER_ID_LABELS, sellerDeclaration } from "@/modules/sales";
import { getBusinessProfile } from "@/modules/settings";
import { SlipPrintControls } from "./slip-print-controls";

export const metadata: Metadata = { title: "Trade-in slip" };

/** 80 mm slip the seller signs (two copies: customer + shop). ?print=1 opens the print dialog. */
export default async function TradeInSlipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "tradeins.view")) return <p className="p-6 text-sm text-slate-600">You do not have access to trade-ins.</p>;
  const { id } = await params;
  const sp = await searchParams;
  const [profile, t] = await Promise.all([getBusinessProfile(ctx.db), getTradeInDetail(ctx.db, id)]);
  const legal = await getOutletTax(ctx.db, t.outlet.id, profile);
  const money = (c: number) => formatMoney(c, profile.currency);
  const buyer = legal.legalName ?? profile.name;

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <SlipPrintControls autoPrint={firstParam(sp.print) === "1"} />
      <div className="mx-auto w-[80mm] bg-white px-3 py-4 font-mono text-[11px] leading-snug text-black shadow print:shadow-none">
        <div className="text-center">
          <div className="text-sm font-bold">{profile.name}</div>
          {legal.legalName ? <div>{legal.legalName}</div> : null}
          {legal.registrationNo ? <div>UEN: {legal.registrationNo}</div> : null}
          <div className="mt-1">{t.outlet.name}</div>
          {t.outlet.address ? <div className="whitespace-pre-line">{t.outlet.address}</div> : null}
          {t.outlet.phone ? <div>Tel: {t.outlet.phone}</div> : null}
          <div className="mt-2 text-xs font-bold">TRADE-IN / BUY-BACK</div>
        </div>

        <div className="my-2 border-t border-dashed border-black" />
        <div>No: {t.number}</div>
        <div>Date: {formatDateTime(t.createdAt)}</div>
        <div>Staff: {t.createdBy}</div>
        {t.bookingRef ? <div>Booking: {t.bookingRef}</div> : null}

        <div className="my-2 border-t border-dashed border-black" />
        <div className="font-bold">Seller</div>
        <div>{t.seller.name}</div>
        {t.seller.idType ? (
          <div>
            {SELLER_ID_LABELS[t.seller.idType]}: {t.seller.idNumberMasked}
          </div>
        ) : null}
        {t.seller.phone ? <div>Tel: {t.seller.phone}</div> : null}

        <div className="my-2 border-t border-dashed border-black" />
        {t.items.map((i) => (
          <div key={i.id} className="mb-1.5">
            <div>{i.description}</div>
            <div>IMEI/SN: {i.identifier}</div>
            <div className="flex justify-between">
              <span>
                {i.grade ? `Grade ${i.grade}` : ""}
                {i.batteryHealth !== null ? ` · Batt ${i.batteryHealth}%` : ""}
              </span>
              <span>{money(i.priceCents)}</span>
            </div>
            {i.issues.length > 0 ? <div>Issues: {i.issues.join("; ")}</div> : null}
          </div>
        ))}

        <div className="my-2 border-t border-dashed border-black" />
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{money(t.totalCents)}</span>
        </div>
        <div>
          {t.settlement === "SALE_CREDIT" && t.sale ? `Credited to sale ${t.sale.number}` : `Paid by ${t.paymentMethodName ?? "—"}`}
          {t.payoutReference ? ` (${t.payoutReference})` : ""}
        </div>

        <div className="my-2 border-t border-dashed border-black" />
        <p className="text-justify">{sellerDeclaration(buyer)}</p>
        <div className="mt-8 border-t border-black pt-0.5">Seller signature</div>
        <div className="mt-8 border-t border-black pt-0.5">Staff signature</div>
        <p className="mt-3 text-[9px]">
          Your particulars are collected as required for secondhand goods dealers and are used only for that purpose.
        </p>
      </div>
    </div>
  );
}
