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
import { addDays, formatDateTime, parseDateInput, toDateInputValue } from "@/lib/time";
import { listSales } from "@/modules/sales";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "sales.view")) return <NoAccess />;
  const sp = await searchParams;

  const today = toDateInputValue(new Date());
  const fromValue = firstParam(sp.from) ?? today;
  const toValue = firstParam(sp.to) ?? today;
  const from = parseDateInput(fromValue) ?? undefined;
  const toStart = parseDateInput(toValue);
  const to = toStart ? addDays(toStart, 1) : undefined;
  const q = firstParam(sp.q);
  // Cashiers only see their own outlet
  const outletParam = firstParam(sp.outlet);
  const outletId = can(ctx.role, "outlets.switch") ? (outletParam === "all" ? undefined : (outletParam ?? ctx.outletId)) : ctx.outletId;

  const [profile, sales] = await Promise.all([getBusinessProfile(ctx.db), listSales(ctx.db, { outletId, from, to, q })]);
  const money = (c: number) => formatMoney(c, profile.currency);
  const total = sales.reduce((s, x) => s + x.totalCents - x.refundedCents, 0);

  return (
    <div>
      <PageHeader title="Sales" description={`${sales.length} sale(s) · net ${money(total)}`} />
      <FilterBar>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={fromValue} className={inputClass} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={toValue} className={inputClass} />
        </FilterField>
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
          <input name="q" defaultValue={q} placeholder="Receipt no., customer, IMEI" className={`${inputClass} w-64`} />
        </FilterField>
      </FilterBar>
      <Card>
        {sales.length === 0 ? (
          <EmptyState title="No sales found for these filters" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Date</Th>
                <Th>Outlet</Th>
                <Th>Cashier</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th className="text-right">Items</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/sales/${s.id}`} className="font-medium text-indigo-600 hover:underline">
                      {s.number}
                    </Link>
                  </Td>
                  <Td>{formatDateTime(s.createdAt)}</Td>
                  <Td>{s.outletCode}</Td>
                  <Td>{s.cashier}</Td>
                  <Td>{s.customer ?? <span className="text-slate-400">Walk-in</span>}</Td>
                  <Td>
                    <StatusBadge status={s.status} />
                  </Td>
                  <Td className="text-right tabular-nums">{s.itemCount}</Td>
                  <Td className="text-right tabular-nums">
                    {money(s.totalCents)}
                    {s.refundedCents > 0 ? <div className="text-xs text-rose-600">−{money(s.refundedCents)}</div> : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
