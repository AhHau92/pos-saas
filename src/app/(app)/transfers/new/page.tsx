import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { firstParam, type SearchParams } from "@/lib/page";
import { listOutlets } from "@/modules/outlets";
import { getBusinessProfile } from "@/modules/settings";
import { listReturnableItems, type ReturnableItems } from "@/modules/transfers";
import { TransferForm } from "./transfer-form";

export const metadata: Metadata = { title: "New transfer" };

/** ?returnOf=<transferId> pre-fills a transfer back to the sender (wrong / damaged items). */
export default async function NewTransferPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "transfers.manage")) return <NoAccess />;
  const sp = await searchParams;
  const returnOf = firstParam(sp.returnOf);
  const [profile, outlets, returnable] = await Promise.all([
    getBusinessProfile(ctx.db),
    listOutlets(ctx.db),
    returnOf ? listReturnableItems(ctx.db, returnOf) : Promise.resolve<ReturnableItems | null>(null),
  ]);
  const wrongOutlet = returnable !== null && returnable.outletId !== ctx.outletId;
  const prefill = returnable && !wrongOutlet ? returnable : null;
  const outletCode = (id: string) => outlets.find((o) => o.id === id)?.code ?? "?";

  return (
    <div>
      <PageHeader
        back={
          <Link href={returnable ? `/transfers/${returnable.transferId}` : "/transfers"} className="text-indigo-600 hover:underline">
            ← {returnable ? returnable.number : "Transfers"}
          </Link>
        }
        title={prefill ? `Send items back · ${prefill.number}` : "New stock transfer"}
        description={`Sending from ${ctx.outlet.code} · ${ctx.outlet.name} (switch outlet at the top to send from another outlet)`}
      />
      {wrongOutlet ? (
        <div className="mb-4">
          <Alert tone="amber">
            The items of {returnable.number} are at {outletCode(returnable.outletId)}. Switch to {outletCode(returnable.outletId)} at
            the top, then open “Send items back” again.
          </Alert>
        </div>
      ) : null}
      {prefill ? (
        <div className="mb-4">
          <Alert tone="blue">
            Pre-filled with what was received on {prefill.number} and is still in stock here. Remove anything that stays, then
            dispatch.
          </Alert>
        </div>
      ) : null}
      <TransferForm
        fromOutletId={ctx.outletId}
        destinations={outlets.filter((o) => o.id !== ctx.outletId).map((o) => ({ id: o.id, code: o.code, name: o.name }))}
        currency={profile.currency}
        initial={
          prefill
            ? {
                toOutletId: prefill.backToOutletId,
                notes: `Return of ${prefill.number}`,
                units: prefill.units,
                lines: prefill.lines,
              }
            : undefined
        }
      />
    </div>
  );
}
