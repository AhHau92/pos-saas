import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { Card, CardHeader, DetailList, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/time";
import { getTransferDetail } from "@/modules/transfers";
import { TransferActions } from "./transfer-actions";

export const metadata: Metadata = { title: "Transfer" };

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "transfers.view")) return <NoAccess />;
  const { id } = await params;
  const t = await getTransferDetail(ctx.db, id);

  const canManage = can(ctx.role, "transfers.manage");
  const canReceive =
    t.status === "IN_TRANSIT" &&
    can(ctx.role, "transfers.receive") &&
    (can(ctx.role, "outlets.switch") || t.toOutletId === ctx.outletId);

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link href="/transfers" className="text-indigo-600 hover:underline">
            ← Transfers
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {t.number} <StatusBadge status={t.status} />
          </span>
        }
        description={`${t.fromOutlet} ${t.fromOutletName} → ${t.toOutlet} ${t.toOutletName}`}
        actions={<TransferActions id={t.id} status={t.status} canManage={canManage} canReceive={canReceive} />}
      />
      <Card>
        <DetailList
          items={[
            { label: "Created", value: `${formatDateTime(t.createdAt)} · ${t.createdBy}` },
            { label: "Dispatched", value: t.dispatchedAt ? `${formatDateTime(t.dispatchedAt)} · ${t.dispatchedBy ?? ""}` : "—" },
            { label: "Received", value: t.receivedAt ? `${formatDateTime(t.receivedAt)} · ${t.receivedBy ?? ""}` : "—" },
            { label: "Total quantity", value: t.quantity },
            { label: "Notes", value: t.notes ?? "—" },
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="Items" />
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>IMEI / Serial</Th>
              <Th className="text-right">Qty</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.items.map((i) => (
              <tr key={i.id}>
                <Td>
                  <div className="text-slate-900">{i.label}</div>
                  <div className="text-xs text-slate-500">{i.sku}</div>
                </Td>
                <Td>
                  {i.stockUnitId ? (
                    <Link href={`/inventory/units/${i.stockUnitId}`} className="font-mono text-xs text-indigo-600 hover:underline">
                      {i.identifier}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-right tabular-nums">{i.quantity}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
