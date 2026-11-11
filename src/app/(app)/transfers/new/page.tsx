import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listOutlets } from "@/modules/outlets";
import { getBusinessProfile } from "@/modules/settings";
import { TransferForm } from "./transfer-form";

export const metadata: Metadata = { title: "New transfer" };

export default async function NewTransferPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "transfers.manage")) return <NoAccess />;
  const [profile, outlets] = await Promise.all([getBusinessProfile(ctx.db), listOutlets(ctx.db)]);
  return (
    <div>
      <PageHeader
        back={
          <Link href="/transfers" className="text-indigo-600 hover:underline">
            ← Transfers
          </Link>
        }
        title="New stock transfer"
        description={`Sending from ${ctx.outlet.code} · ${ctx.outlet.name} (switch outlet at the top to send from another outlet)`}
      />
      <TransferForm
        fromOutletId={ctx.outletId}
        destinations={outlets.filter((o) => o.id !== ctx.outletId).map((o) => ({ id: o.id, code: o.code, name: o.name }))}
        currency={profile.currency}
      />
    </div>
  );
}
