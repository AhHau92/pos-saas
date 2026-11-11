import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { firstParam, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { getDashboard } from "@/modules/reports";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  const sp = await searchParams;
  const canSeeAll = can(ctx.role, "reports.view") && ctx.outlets.length > 1;
  const allOutlets = canSeeAll && firstParam(sp.scope) === "all";
  const [profile, data] = await Promise.all([
    getBusinessProfile(ctx.db),
    getDashboard(ctx.db, { outletId: ctx.outletId, allOutlets }),
  ]);
  const money = (cents: number) => formatMoney(cents, profile.currency);
  const showProfit = can(ctx.role, "reports.view");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good day, ${ctx.user.name.split(" ")[0]}`}
        description={allOutlets ? "Today · all outlets" : `Today · ${ctx.outlet.code} ${ctx.outlet.name}`}
        actions={
          canSeeAll ? (
            <div className="flex rounded-md bg-white p-0.5 ring-1 ring-slate-200">
              <Link
                href="/dashboard"
                className={`rounded px-3 py-1 text-sm ${!allOutlets ? "bg-indigo-600 text-white" : "text-slate-600"}`}
              >
                This outlet
              </Link>
              <Link
                href="/dashboard?scope=all"
                className={`rounded px-3 py-1 text-sm ${allOutlets ? "bg-indigo-600 text-white" : "text-slate-600"}`}
              >
                All outlets
              </Link>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sales today" value={money(data.today.salesCents)} hint={`${data.today.salesCount} transactions`} />
        <Stat label="Refunds today" value={money(data.today.refundsCents)} hint={`Net ${money(data.today.netCents)}`} />
        <Stat label="Items sold" value={data.today.itemsSold} />
        {showProfit ? (
          <Stat label="Gross profit" value={money(data.today.grossProfitCents)} hint="Excl. tax, before refunds" />
        ) : (
          <Stat label="Units in stock" value={data.stock.serializedUnits} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent sales"
            actions={
              <Link href="/sales" className="text-sm text-indigo-600 hover:underline">
                View all
              </Link>
            }
          />
          {data.recentSales.length === 0 ? (
            <EmptyState title="No sales yet">
              <Link href="/pos" className={buttonClass("primary", "sm", "mt-3")}>
                Open POS
              </Link>
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Receipt</Th>
                  <Th>Time</Th>
                  <Th>Cashier</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentSales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/sales/${s.id}`} className="font-medium text-indigo-600 hover:underline">
                        {s.number}
                      </Link>
                    </Td>
                    <Td>{formatDateTime(s.createdAt)}</Td>
                    <Td>{s.cashier}</Td>
                    <Td>
                      <StatusBadge status={s.status} />
                    </Td>
                    <Td className="text-right tabular-nums">{money(s.totalCents)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Payments today" />
            {data.paymentsByMethod.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.paymentsByMethod.map((p) => (
                  <li key={p.methodName} className="flex justify-between px-5 py-2.5 text-sm">
                    <span className="text-slate-600">{p.methodName}</span>
                    <span className="font-medium tabular-nums">{money(p.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.incomingTransfers.length > 0 ? (
            <Card>
              <CardHeader title="Incoming transfers" description="Waiting for you to confirm receipt" />
              <ul className="divide-y divide-slate-100">
                {data.incomingTransfers.map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <Link href={`/transfers/${t.id}`} className="font-medium text-indigo-600 hover:underline">
                      {t.number}
                    </Link>
                    <span className="text-slate-500">
                      from {t.fromOutlet} · {t.quantity} pcs
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Low stock"
              description={`${ctx.outlet.code} · at or below minimum`}
              actions={
                <Link href="/inventory?low=1" className="text-sm text-indigo-600 hover:underline">
                  View
                </Link>
              }
            />
            {data.lowStock.length === 0 ? (
              <EmptyState title="All good" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.lowStock.map((i) => (
                  <li key={i.variantId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-slate-700">{i.label}</span>
                    <span className={`shrink-0 tabular-nums ${i.quantity === 0 ? "text-rose-600" : "text-amber-600"}`}>
                      {i.quantity} / {i.minStock}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {data.byOutlet.length > 0 ? (
        <Card>
          <CardHeader title="Sales by outlet (today)" />
          <Table>
            <thead>
              <tr>
                <Th>Outlet</Th>
                <Th className="text-right">Transactions</Th>
                <Th className="text-right">Sales</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.byOutlet.map((o) => (
                <tr key={o.outletId}>
                  <Td className="font-medium">{o.outletCode}</Td>
                  <Td className="text-right tabular-nums">{o.salesCount}</Td>
                  <Td className="text-right tabular-nums">{money(o.salesCents)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Phones / devices in stock" value={data.stock.serializedUnits} hint={allOutlets ? "All outlets" : ctx.outlet.code} />
        <Stat label="Accessories in stock" value={data.stock.quantityItems} hint={allOutlets ? "All outlets" : ctx.outlet.code} />
        {showProfit ? <Stat label="Stock value (cost)" value={money(data.stock.costValueCents)} /> : null}
      </div>
    </div>
  );
}
