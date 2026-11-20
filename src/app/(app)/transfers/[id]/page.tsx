import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Alert, Badge, Card, CardHeader, DetailList, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/time";
import { getTransferDetail, isOpenTransfer, TRANSFER_STATUS_LABELS, type TransferDetail } from "@/modules/transfers";
import { ResolvePanel } from "./resolve-panel";
import { TransferActions } from "./transfer-actions";

export const metadata: Metadata = { title: "Transfer" };

function itemState(i: TransferDetail["items"][number], fromOutlet: string) {
  if (i.stockUnitId) {
    if (i.receivedQuantity > 0) return <Badge tone="green">Received</Badge>;
    if (i.lostQuantity > 0) return <Badge tone="red">Lost</Badge>;
    if (i.returnedQuantity > 0) return <Badge tone="gray">Returned to {fromOutlet}</Badge>;
    return <Badge tone="blue">In transit</Badge>;
  }
  if (i.outstandingQuantity === 0 && i.lostQuantity === 0 && i.returnedQuantity === 0) return <Badge tone="green">Received</Badge>;
  return i.outstandingQuantity > 0 ? <Badge tone="blue">{i.outstandingQuantity} in transit</Badge> : <Badge tone="purple">Settled</Badge>;
}

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "transfers.view")) return <NoAccess />;
  const { id } = await params;
  const t = await getTransferDetail(ctx.db, id);

  const open = isOpenTransfer(t.status);
  const canManage = can(ctx.role, "transfers.manage");
  const atDestination = can(ctx.role, "outlets.switch") || t.toOutletId === ctx.outletId;
  const canReceive = open && can(ctx.role, "transfers.receive") && atDestination;
  const canResolve = open && canManage && t.outstandingQuantity > 0;
  const canSendBack = canManage && t.receivedQuantity > 0;
  const missing = t.items.filter((i) => i.outstandingQuantity > 0);

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
        actions={
          <>
            <TransferActions id={t.id} status={t.status} canManage={canManage} />
            {canSendBack ? (
              <Link href={`/transfers/new?returnOf=${t.id}`} className={buttonClass("secondary")}>
                <Icon name="transfer" className="h-4 w-4" /> Send items back
              </Link>
            ) : null}
            {canReceive ? (
              <Link href={`/transfers/${t.id}/receive`} className={buttonClass("success")}>
                <Icon name="check" className="h-4 w-4" /> Receive items
              </Link>
            ) : null}
          </>
        }
      />

      {t.status === "PARTIALLY_RECEIVED" ? (
        <Alert tone="amber">
          {t.receivedQuantity} of {t.quantity} received · <strong>{t.outstandingQuantity} still in transit</strong>.{" "}
          {canManage
            ? "Receive them when they arrive, or settle missing items below (lost / return to sender)."
            : "Receive them when they arrive. A manager can settle items that do not turn up."}
        </Alert>
      ) : null}
      {t.status === "CLOSED" ? (
        <Alert tone="amber">
          {TRANSFER_STATUS_LABELS[t.status]}: {t.receivedQuantity} received
          {t.lostQuantity > 0 ? ` · ${t.lostQuantity} lost (written off)` : ""}
          {t.returnedQuantity > 0 ? ` · ${t.returnedQuantity} returned to ${t.fromOutlet}` : ""}.
        </Alert>
      ) : null}

      <Card>
        <DetailList
          items={[
            { label: "Created", value: `${formatDateTime(t.createdAt)} · ${t.createdBy}` },
            { label: "Dispatched", value: t.dispatchedAt ? `${formatDateTime(t.dispatchedAt)} · ${t.dispatchedBy ?? ""}` : "—" },
            { label: "Last received", value: t.receivedAt ? `${formatDateTime(t.receivedAt)} · ${t.receivedBy ?? ""}` : "—" },
            { label: "Sent / received", value: `${t.quantity} / ${t.receivedQuantity}` },
            {
              label: "Missing items settled",
              value: t.resolvedAt
                ? `${formatDateTime(t.resolvedAt)} · ${t.resolvedBy ?? ""}${t.resolutionNote ? ` — ${t.resolutionNote}` : ""}`
                : "—",
            },
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
              <Th className="text-right">Sent</Th>
              <Th className="text-right">Received</Th>
              <Th className="text-right">Lost</Th>
              <Th className="text-right">Returned</Th>
              <Th>Status</Th>
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
                <Td className="text-right tabular-nums">{t.status === "DRAFT" ? "—" : i.receivedQuantity}</Td>
                <Td className="text-right tabular-nums">{i.lostQuantity || "—"}</Td>
                <Td className="text-right tabular-nums">{i.returnedQuantity || "—"}</Td>
                <Td>
                  {t.status === "DRAFT" || (t.status === "CANCELLED" && i.returnedQuantity === 0) ? "—" : itemState(i, t.fromOutlet)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {canResolve ? (
        <ResolvePanel
          transferId={t.id}
          fromOutlet={t.fromOutlet}
          items={missing.map((i) => ({
            itemId: i.id,
            label: i.label,
            sku: i.sku,
            identifier: i.identifier,
            serialized: i.stockUnitId !== null,
            outstanding: i.outstandingQuantity,
          }))}
        />
      ) : null}
    </div>
  );
}
