import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getBusinessProfile } from "@/modules/settings";
import { AdjustmentForm } from "./adjustment-form";

export const metadata: Metadata = { title: "New stock adjustment" };

export default async function NewAdjustmentPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "inventory.adjust")) return <NoAccess />;
  const profile = await getBusinessProfile(ctx.db);
  return (
    <div>
      <PageHeader
        back={
          <Link href="/inventory/adjustments" className="text-indigo-600 hover:underline">
            ← Adjustments
          </Link>
        }
        title="New stock adjustment"
        description="Load opening stock, correct counts, or change the status of an IMEI unit"
      />
      <AdjustmentForm outlets={ctx.outlets} defaultOutletId={ctx.outletId} currency={profile.currency} />
    </div>
  );
}
