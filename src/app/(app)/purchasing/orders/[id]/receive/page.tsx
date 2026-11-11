import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getPurchaseOrderDetail } from "@/modules/purchasing";
import { getBusinessProfile } from "@/modules/settings";
import { ReceiveForm } from "./receive-form";

export const metadata: Metadata = { title: "Receive goods" };

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "purchasing.manage")) return <NoAccess />;
  const { id } = await params;
  const [profile, po] = await Promise.all([getBusinessProfile(ctx.db), getPurchaseOrderDetail(ctx.db, id)]);
  if (po.status === "RECEIVED" || po.status === "CANCELLED") redirect(`/purchasing/orders/${id}`);
  return (
    <div>
      <PageHeader
        back={
          <Link href={`/purchasing/orders/${id}`} className="text-indigo-600 hover:underline">
            ← {po.number}
          </Link>
        }
        title={`Receive goods · ${po.number}`}
        description={`${po.supplierName} → ${po.outletName}. Stock goes into this outlet.`}
      />
      <ReceiveForm
        purchaseOrderId={po.id}
        currency={profile.currency}
        items={po.items
          .filter((i) => i.quantity - i.receivedQuantity > 0)
          .map((i) => ({
            id: i.id,
            label: i.label,
            sku: i.sku,
            serialized: i.productType === "SERIALIZED",
            remaining: i.quantity - i.receivedQuantity,
            unitCostCents: i.unitCostCents,
          }))}
      />
    </div>
  );
}
