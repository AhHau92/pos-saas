import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { Badge, Card, CardHeader, DetailList, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time";
import { getPurchaseOrderDetail } from "@/modules/purchasing";
import { getBusinessProfile } from "@/modules/settings";
import { PurchaseOrderActions } from "./po-actions";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "purchasing.view")) return <NoAccess />;
  const { id } = await params;
  const [profile, po] = await Promise.all([getBusinessProfile(ctx.db), getPurchaseOrderDetail(ctx.db, id)]);
  const money = (c: number) => formatMoney(c, profile.currency);

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link href="/purchasing/orders" className="text-indigo-600 hover:underline">
            ← Purchase orders
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {po.number} <StatusBadge status={po.status} />
          </span>
        }
        description={`${po.supplierName} → ${po.outletName}`}
        actions={can(ctx.role, "purchasing.manage") ? <PurchaseOrderActions id={po.id} status={po.status} /> : null}
      />
      <Card>
        <DetailList
          items={[
            { label: "Supplier", value: po.supplierName },
            { label: "Receiving outlet", value: po.outletName },
            { label: "Total", value: money(po.totalCents) },
            { label: "Expected", value: po.expectedAt ? formatDate(po.expectedAt) : "—" },
            { label: "Ordered", value: po.orderedAt ? formatDateTime(po.orderedAt) : "—" },
            { label: "Created by", value: `${po.createdBy} · ${formatDateTime(po.createdAt)}` },
            { label: "Notes", value: po.notes ?? "—" },
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="Items" />
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th className="text-right">Ordered</Th>
              <Th className="text-right">Received</Th>
              <Th className="text-right">Unit cost</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {po.items.map((i) => (
              <tr key={i.id}>
                <Td>
                  <div className="font-medium text-slate-900">{i.label}</div>
                  <div className="text-xs text-slate-500">
                    {i.sku} {i.productType === "SERIALIZED" ? <Badge tone="indigo">IMEI</Badge> : null}
                  </div>
                </Td>
                <Td className="text-right tabular-nums">{i.quantity}</Td>
                <Td className={`text-right tabular-nums ${i.receivedQuantity >= i.quantity ? "text-emerald-700" : ""}`}>{i.receivedQuantity}</Td>
                <Td className="text-right tabular-nums">{money(i.unitCostCents)}</Td>
                <Td className="text-right tabular-nums">{money(i.unitCostCents * i.quantity)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Goods receipts (GRN)" />
        {po.receipts.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Nothing received yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {po.receipts.map((r) => (
              <li key={r.id} className="px-5 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{r.number}</span>
                  <span className="tabular-nums">{money(r.totalCents)}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {formatDateTime(r.receivedAt)} · by {r.receivedBy}
                  {r.notes ? ` · ${r.notes}` : ""}
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                  {r.lines.map((l, index) => (
                    <li key={index}>
                      {l.quantity} × {l.label}
                      {l.identifiers.length > 0 ? <span className="font-mono text-slate-400"> · {l.identifiers.join(", ")}</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
