import type { Metadata } from "next";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listSuppliers } from "@/modules/purchasing";
import { SupplierManager } from "./supplier-manager";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "purchasing.view")) return <NoAccess />;
  const suppliers = await listSuppliers(ctx.db, { includeInactive: true });
  return (
    <div>
      <PageHeader title="Suppliers" description="Distributors and wholesalers you buy stock from" />
      <SupplierManager suppliers={suppliers} canManage={can(ctx.role, "purchasing.manage")} />
    </div>
  );
}
