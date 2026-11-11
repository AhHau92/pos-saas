import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { PurchaseOrderForm } from "@/components/purchasing/purchase-order-form";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listOutlets } from "@/modules/outlets";
import { listSuppliers } from "@/modules/purchasing";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "purchasing.manage")) return <NoAccess />;
  const [profile, suppliers, outlets] = await Promise.all([
    getBusinessProfile(ctx.db),
    listSuppliers(ctx.db),
    listOutlets(ctx.db),
  ]);
  return (
    <div>
      <PageHeader
        back={
          <Link href="/purchasing/orders" className="text-indigo-600 hover:underline">
            ← Purchase orders
          </Link>
        }
        title="New purchase order"
      />
      <PurchaseOrderForm
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        outlets={outlets.map((o) => ({ id: o.id, code: o.code, name: o.name }))}
        defaultOutletId={ctx.outletId}
        currency={profile.currency}
      />
    </div>
  );
}
