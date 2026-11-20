import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReceiptView } from "@/components/receipt/receipt-view";
import { getTenantDb } from "@/lib/db/tenant";
import { getReceiptDataByToken } from "@/modules/sales";
import { resolveTenantBySlug } from "@/modules/tenant";
import { SaveReceiptButton } from "./save-receipt-button";

export const metadata: Metadata = { title: "E-receipt", robots: { index: false, follow: false } };

/**
 * Customer's e-receipt (link in the email / WhatsApp message). No login: the 128-bit token in the
 * URL is the key. Phone numbers are masked; nothing here can change data.
 */
export default async function PublicReceiptPage({ params }: { params: Promise<{ shop: string; token: string }> }) {
  const { shop, token } = await params;
  const tenant = await resolveTenantBySlug(shop);
  if (!tenant || tenant.status !== "ACTIVE") notFound();
  const receipt = await getReceiptDataByToken(getTenantDb(tenant.dbName), token);
  if (!receipt) notFound();

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex w-[80mm] items-center justify-between">
        <span className="text-xs text-slate-500">E-receipt</span>
        <SaveReceiptButton />
      </div>
      <ReceiptView receipt={receipt} maskCustomerPhone note="E-receipt" />
      <p className="no-print mx-auto mt-4 w-[80mm] text-center text-xs text-slate-500">
        Keep this receipt as proof of purchase. To save it as a PDF, tap “Save / print” and choose “Save as PDF”.
      </p>
    </div>
  );
}
