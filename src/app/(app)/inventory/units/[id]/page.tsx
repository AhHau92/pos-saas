import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { Card, CardHeader, DetailList, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { getUnitDetail, UNIT_STATUS_LABELS } from "@/modules/inventory";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "IMEI history" };

function refLink(refType: string, refId: string, refNo: string) {
  const href =
    refType === "SALE"
      ? `/sales/${refId}`
      : refType === "TRANSFER"
        ? `/transfers/${refId}`
        : `/inventory/movements?q=${encodeURIComponent(refNo)}&outlet=all&from=2000-01-01`;
  return (
    <Link href={href} className="text-indigo-600 hover:underline">
      {refNo}
    </Link>
  );
}

const REF_LABELS: Record<string, string> = {
  GOODS_RECEIPT: "Goods receipt",
  SALE: "Sale",
  REFUND: "Refund",
  TRANSFER: "Transfer",
  ADJUSTMENT: "Adjustment",
};

export default async function UnitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "inventory.view")) return <NoAccess />;
  const { id } = await params;
  const [profile, unit] = await Promise.all([getBusinessProfile(ctx.db), getUnitDetail(ctx.db, id)]);
  const money = (c: number) => formatMoney(c, profile.currency);
  const showCost = can(ctx.role, "reports.view");

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link href="/inventory/units" className="text-indigo-600 hover:underline">
            ← IMEI / Serial
          </Link>
        }
        title={
          <span className="flex items-center gap-3 font-mono">
            {unit.imei ?? unit.serialNumber} <StatusBadge status={unit.status} />
          </span>
        }
        description={unit.label}
      />
      <Card>
        <DetailList
          items={[
            { label: "Product", value: <Link className="text-indigo-600 hover:underline" href={`/products/${unit.productId}`}>{unit.label}</Link> },
            { label: "SKU", value: unit.sku },
            { label: "Current outlet", value: `${unit.outletCode} · ${unit.outletName}` },
            { label: "IMEI", value: unit.imei ?? "—" },
            { label: "IMEI 2", value: unit.imei2 ?? "—" },
            { label: "Serial number", value: unit.serialNumber ?? "—" },
            { label: "Grade", value: unit.grade ?? "—" },
            { label: "Battery health", value: unit.batteryHealth !== null ? `${unit.batteryHealth}%` : "—" },
            { label: "Selling price", value: money(unit.priceCents) },
            ...(showCost ? [{ label: "Cost", value: money(unit.costCents) }] : []),
            { label: "Supplier", value: unit.supplierName ?? "—" },
            { label: "Received", value: unit.receivedAt ? formatDateTime(unit.receivedAt) : "—" },
            { label: "Notes", value: unit.notes ?? "—" },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Lifecycle" description="Every status change of this unit" />
        <ol className="relative mx-5 my-4 space-y-4 border-l border-slate-200 pl-6">
          {unit.events.map((e) => (
            <li key={e.id}>
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-indigo-500" />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-slate-900">
                  {e.fromStatus ? `${UNIT_STATUS_LABELS[e.fromStatus]} → ` : ""}
                  {UNIT_STATUS_LABELS[e.toStatus]}
                </span>
                <span className="text-slate-500">
                  {REF_LABELS[e.refType] ?? e.refType} {refLink(e.refType, e.refId, e.refNo)}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {formatDateTime(e.at)}
                {e.outlet ? ` · ${e.outlet}` : ""}
                {e.user ? ` · ${e.user}` : ""}
                {e.note ? ` · ${e.note}` : ""}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {unit.sales.length > 0 ? (
        <Card>
          <CardHeader title="Sales (warranty lookup)" />
          <ul className="divide-y divide-slate-100 text-sm">
            {unit.sales.map((s) => (
              <li key={s.saleId} className="flex justify-between px-5 py-2.5">
                <span>
                  <Link href={`/sales/${s.saleId}`} className="font-medium text-indigo-600 hover:underline">
                    {s.number}
                  </Link>{" "}
                  <span className="text-slate-500">
                    · {formatDateTime(s.at)} · {s.customer ?? "Walk-in"}
                  </span>
                </span>
                <span className="tabular-nums">{money(s.totalCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
