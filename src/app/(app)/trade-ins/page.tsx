import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { NoAccess } from "@/components/no-access";
import { buttonClass } from "@/components/ui/button";
import { inputClass, selectClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { firstParam, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { listTradeIns } from "@/modules/sales";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "Trade-ins" };

export default async function TradeInsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "tradeins.view")) return <NoAccess />;
  const sp = await searchParams;
  const q = firstParam(sp.q);
  // Cashiers only see their own outlet
  const outletParam = firstParam(sp.outlet);
  const outletId = can(ctx.role, "outlets.switch") ? (outletParam === "all" ? undefined : (outletParam ?? ctx.outletId)) : ctx.outletId;

  const [profile, rows] = await Promise.all([getBusinessProfile(ctx.db), listTradeIns(ctx.db, { outletId, q })]);
  const money = (c: number) => formatMoney(c, profile.currency);
  const total = rows.reduce((s, r) => s + r.totalCents, 0);

  return (
    <div>
      <PageHeader
        title="Trade-ins"
        description={`Used devices bought from customers · ${rows.length} record(s) · ${money(total)}`}
        actions={
          can(ctx.role, "tradeins.create") ? (
            <Link href="/trade-ins/new" className={buttonClass("primary")}>
              <Icon name="plus" className="h-4 w-4" /> Buy a device
            </Link>
          ) : null
        }
      />
      <FilterBar>
        {can(ctx.role, "outlets.switch") ? (
          <FilterField label="Outlet">
            <select name="outlet" defaultValue={outletParam ?? ctx.outletId} className={selectClass}>
              <option value="all">All outlets</option>
              {ctx.outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {o.name}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}
        <FilterField label="Search">
          <input name="q" defaultValue={q} placeholder="TI no., seller, phone, IMEI" className={`${inputClass} w-64`} />
        </FilterField>
      </FilterBar>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No trade-ins yet">
            Buy a device here, or add a trade-in to a sale in the POS.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>No.</Th>
                <Th>Date</Th>
                <Th>Outlet</Th>
                <Th>Seller</Th>
                <Th className="text-right">Devices</Th>
                <Th className="text-right">Amount</Th>
                <Th>Paid as</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/trade-ins/${r.id}`} className="font-medium text-indigo-600 hover:underline">
                      {r.number}
                    </Link>
                  </Td>
                  <Td>{formatDateTime(r.createdAt)}</Td>
                  <Td className="font-mono text-xs">{r.outletCode}</Td>
                  <Td>{r.sellerName}</Td>
                  <Td className="text-right tabular-nums">{r.devices}</Td>
                  <Td className="text-right tabular-nums">{money(r.totalCents)}</Td>
                  <Td>{r.settlement === "SALE_CREDIT" ? <Badge tone="indigo">{r.settledWith}</Badge> : r.settledWith}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
