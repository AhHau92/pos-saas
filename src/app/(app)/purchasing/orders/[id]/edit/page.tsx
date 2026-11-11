import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/no-access";
import { PurchaseOrderForm } from "@/components/purchasing/purchase-order-form";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listOutlets } from "@/modules/outlets";
import { getPurchaseOrderDetail, listSuppliers } from "@/modules/purchasing";
import { getBusinessProfile } from "@/modules/settings";
import { toDateInputValue } from "@/lib/time";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "purchasing.manage")) return <NoAccess />;
  const { id } = await params;
  const po = await getPurchaseOrderDetail(ctx.db, id);
  if (po.status !== "DRAFT") redirect(`/purchasing/orders/${id}`);
  const [profile, suppliers, outlets] = await Promise.all([
    getBusinessProfile(ctx.db),
    listSuppliers(ctx.db),
    listOutlets(ctx.db),
  ]);
  return (
    <div>
      <PageHeader
        back={
          <Link href={`/purchasing/orders/${id}`} className="text-indigo-600 hover:underline">
            ← {po.number}
          </Link>
        }
        title={`Edit ${po.number}`}
      />
      <PurchaseOrderForm
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        outlets={outlets.map((o) => ({ id: o.id, code: o.code, name: o.name }))}
        defaultOutletId={ctx.outletId}
        currency={profile.currency}
        initial={{
          id: po.id,
          supplierId: po.supplierId,
          outletId: po.outletId,
          expectedAt: po.expectedAt ? toDateInputValue(new Date(po.expectedAt)) : null,
          notes: po.notes,
          items: po.items.map((i) => ({
            variantId: i.variantId,
            label: i.label,
            sku: i.sku,
            productType: i.productType,
            quantity: i.quantity,
            unitCostCents: i.unitCostCents,
          })),
        }}
      />
    </div>
  );
}
