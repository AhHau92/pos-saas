import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { listPlans } from "@/modules/tenant";
import { NewTenantForm } from "./new-tenant-form";

export const metadata: Metadata = { title: "New tenant" };

export default async function NewTenantPage() {
  await requirePlatformAdmin();
  const plans = await listPlans();
  return (
    <div>
      <PageHeader
        back={
          <Link href="/platform" className="text-indigo-600 hover:underline">
            ← Tenants
          </Link>
        }
        title="New tenant"
        description="Creates a new database for the shop, an HQ outlet and the owner account"
      />
      <NewTenantForm plans={plans.map((p) => ({ code: p.code, name: p.name, maxOutlets: p.maxOutlets, maxUsers: p.maxUsers }))} />
    </div>
  );
}
