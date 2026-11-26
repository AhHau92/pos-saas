import type { Metadata } from "next";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listCompanies, listOutlets } from "@/modules/outlets";
import { OutletManager } from "./outlet-manager";

export const metadata: Metadata = { title: "Outlets" };

export default async function OutletsPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "outlets.manage")) return <NoAccess />;
  const [outlets, companies] = await Promise.all([listOutlets(ctx.db, { includeInactive: true }), listCompanies(ctx.db)]);
  return (
    <div>
      <PageHeader
        title="Outlets"
        description={
          ctx.tenant.plan
            ? `Your plan allows ${ctx.tenant.plan.maxOutlets} active outlet(s). The outlet code is the prefix of receipt numbers.`
            : "The outlet code is the prefix of receipt numbers."
        }
      />
      <OutletManager outlets={outlets} companies={companies.map((c) => ({ id: c.id, name: c.name, gstRegistered: c.gstRegistered }))} />
    </div>
  );
}
