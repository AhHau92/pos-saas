import type { Metadata } from "next";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listCompanies } from "@/modules/outlets";
import { getBusinessProfile } from "@/modules/settings";
import { CompanyManager } from "./company-manager";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "outlets.manage")) return <NoAccess />;
  const [companies, profile] = await Promise.all([listCompanies(ctx.db, { includeInactive: true }), getBusinessProfile(ctx.db)]);
  return (
    <div>
      <PageHeader
        title="Companies"
        description="Only needed when your outlets belong to different companies (e.g. one GST-registered, one not). Then add each company here and choose it for each outlet under Outlets."
      />
      <CompanyManager
        companies={companies}
        defaultCompany={{
          name: profile.name,
          registrationNo: profile.registrationNo,
          taxRegistrationNo: profile.taxRegistrationNo,
          taxName: profile.taxName,
          taxRate: profile.taxRateBps / 100,
        }}
      />
    </div>
  );
}
