import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { NoAccess } from "@/components/no-access";
import { inputClass, selectClass } from "@/components/ui/form";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { firstParam, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { searchUnits, UNIT_STATUS_LABELS, UNIT_STATUSES } from "@/modules/inventory";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "IMEI / Serial" };

export default async function UnitsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "inventory.view")) return <NoAccess />;
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const statusParam = firstParam(sp.status);
  const status = UNIT_STATUSES.find((s) => s === statusParam);
  const outletId = firstParam(sp.outletId);
  const variantId = firstParam(sp.variantId);
  const [profile, units] = await Promise.all([
    getBusinessProfile(ctx.db),
    searchUnits(ctx.db, { q, status, outletId, variantId, take: 300 }),
  ]);
  const money = (c: number) => formatMoney(c, profile.currency);
  const showCost = can(ctx.role, "reports.view");

  return (
    <div>
      <PageHeader title="IMEI / Serial numbers" description="Every phone, tablet and laptop tracked one by one" />
      <FilterBar>
        <FilterField label="IMEI / serial / product">
          <input name="q" defaultValue={q} placeholder="Scan or type IMEI…" className={`${inputClass} w-72`} autoFocus />
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={status ?? ""} className={selectClass}>
            <option value="">All statuses</option>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {UNIT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Outlet">
          <select name="outletId" defaultValue={outletId ?? ""} className={selectClass}>
            <option value="">All outlets</option>
            {ctx.outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} · {o.name}
              </option>
            ))}
          </select>
        </FilterField>
        {variantId ? <input type="hidden" name="variantId" value={variantId} /> : null}
      </FilterBar>
      <Card>
        {units.length === 0 ? (
          <EmptyState title="No units found" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>IMEI / Serial</Th>
                <Th>Product</Th>
                <Th>Status</Th>
                <Th>Outlet</Th>
                <Th>Grade / Battery</Th>
                <Th className="text-right">Price</Th>
                {showCost ? <Th className="text-right">Cost</Th> : null}
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/inventory/units/${u.id}`} className="font-mono text-xs font-medium text-indigo-600 hover:underline">
                      {u.imei ?? u.serialNumber}
                    </Link>
                    {u.imei && u.serialNumber ? <div className="font-mono text-[11px] text-slate-400">{u.serialNumber}</div> : null}
                  </Td>
                  <Td>
                    <div className="text-slate-900">{u.label}</div>
                    <div className="text-xs text-slate-500">{u.sku}</div>
                  </Td>
                  <Td>
                    <StatusBadge status={u.status} />
                  </Td>
                  <Td>{u.outletCode}</Td>
                  <Td className="text-xs">
                    {[u.grade ? `Grade ${u.grade}` : null, u.batteryHealth !== null ? `${u.batteryHealth}%` : null].filter(Boolean).join(" · ") || "—"}
                  </Td>
                  <Td className="text-right tabular-nums">{money(u.priceCents)}</Td>
                  {showCost ? <Td className="text-right tabular-nums text-slate-500">{money(u.costCents)}</Td> : null}
                  <Td className="text-xs text-slate-500">{formatDateTime(u.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
