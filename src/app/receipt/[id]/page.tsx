import type { Metadata } from "next";
import { ReceiptView } from "@/components/receipt/receipt-view";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { firstParam, type SearchParams } from "@/lib/page";
import { getReceiptData } from "@/modules/sales";
import { PrintControls } from "./print-controls";

export const metadata: Metadata = { title: "Receipt" };

/**
 * 80 mm thermal receipt, from the snapshot taken at checkout. Opened in a new tab from the POS;
 * ?print=1 opens the print dialog. The first print is the original, later prints say REPRINT.
 */
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "sales.view")) return <p className="p-6 text-sm text-slate-600">You do not have access to receipts.</p>;
  const { id } = await params;
  const sp = await searchParams;
  const receipt = await getReceiptData(ctx.db, id);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <PrintControls saleId={receipt.saleId} autoPrint={firstParam(sp.print) === "1"} printCount={receipt.printCount} />
      <ReceiptView receipt={receipt} reprint={receipt.printCount > 0} />
      {!receipt.headerSnapshot ? (
        <p className="no-print mx-auto mt-3 w-[80mm] text-center text-xs text-slate-500">
          This sale was made before receipt snapshots were introduced; the header shows the current business details.
        </p>
      ) : null}
    </div>
  );
}
