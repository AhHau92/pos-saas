import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/no-access";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getTransferDetail, isOpenTransfer } from "@/modules/transfers";
import { ReceiveTransferForm } from "./receive-transfer-form";

export const metadata: Metadata = { title: "Receive transfer" };

export default async function ReceiveTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "transfers.receive")) return <NoAccess />;
  const { id } = await params;
  const t = await getTransferDetail(ctx.db, id);
  if (!isOpenTransfer(t.status)) redirect(`/transfers/${id}`);

  const back = (
    <Link href={`/transfers/${id}`} className="text-indigo-600 hover:underline">
      ← {t.number}
    </Link>
  );
  if (!can(ctx.role, "outlets.switch") && t.toOutletId !== ctx.outletId) {
    return (
      <div>
        <PageHeader back={back} title={`Receive ${t.number}`} />
        <Alert tone="amber">Only {t.toOutlet} can receive this transfer.</Alert>
      </div>
    );
  }

  const open = t.items.filter((i) => i.outstandingQuantity > 0);
  return (
    <div>
      <PageHeader
        back={back}
        title={`Receive ${t.number}`}
        description={`${t.fromOutlet} → ${t.toOutlet} ${t.toOutletName}. Scan or tick what actually arrived — anything not ticked stays in transit.`}
      />
      <ReceiveTransferForm
        transferId={t.id}
        units={open
          .filter((i) => i.stockUnitId)
          .map((i) => ({ itemId: i.id, identifier: i.identifier ?? "", label: i.label, sku: i.sku }))}
        lines={open
          .filter((i) => !i.stockUnitId)
          .map((i) => ({ itemId: i.id, label: i.label, sku: i.sku, outstanding: i.outstandingQuantity }))}
      />
    </div>
  );
}
