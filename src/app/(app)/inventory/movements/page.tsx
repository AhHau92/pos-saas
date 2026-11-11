import type { Metadata } from "next";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { NoAccess } from "@/components/no-access";
import { inputClass, selectClass } from "@/components/ui/form";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { firstParam, type SearchParams } from "@/lib/page";
import { addDays, formatDateTime, parseDateInput, toDateInputValue } from "@/lib/time";
import { listMovements } from "@/modules/inventory";

export const metadata: Metadata = { title: "Stock ledger" };

const TYPE_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Purchase receipt",
  SALE: "Sale",
  SALE_RETURN: "Customer return",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  ADJUSTMENT_IN: "Adjustment +",
  ADJUSTMENT_OUT: "Adjustment −",
};

export default async function MovementsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "inventory.view")) return <NoAccess />;
  const sp = await searchParams;
  const defaultFrom = toDateInputValue(addDays(new Date(), -7));
  const fromValue = firstParam(sp.from) ?? defaultFrom;
  const toValue = firstParam(sp.to) ?? toDateInputValue(new Date());
  const toStart = parseDateInput(toValue);
  const outletParam = firstParam(sp.outlet);
  const outletId = outletParam === "all" ? undefined : (outletParam ?? ctx.outletId);
  const q = firstParam(sp.q);
  const movements = await listMovements(ctx.db, {
    outletId,
    q,
    from: parseDateInput(fromValue) ?? undefined,
    to: toStart ? addDays(toStart, 1) : undefined,
    take: 500,
  });

  return (
    <div>
      <PageHeader title="Stock ledger" description="Every quantity change (库存流水). Quantity is + in / − out; balance is the outlet's stock after the movement." />
      <FilterBar>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={fromValue} className={inputClass} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={toValue} className={inputClass} />
        </FilterField>
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
        <FilterField label="Search">
          <input name="q" defaultValue={q} placeholder="Doc no., SKU, product, IMEI" className={`${inputClass} w-64`} />
        </FilterField>
      </FilterBar>
      <Card>
        {movements.length === 0 ? (
          <EmptyState title="No movements in this period" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Outlet</Th>
                <Th>Type</Th>
                <Th>Document</Th>
                <Th>Product</Th>
                <Th>IMEI</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Balance</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(m.at)}</Td>
                  <Td>{m.outletCode}</Td>
                  <Td>
                    <Badge tone={m.quantity > 0 ? "green" : "red"}>{TYPE_LABELS[m.type] ?? m.type}</Badge>
                  </Td>
                  <Td className="text-xs">{m.refNo}</Td>
                  <Td>
                    <div className="text-slate-900">{m.label}</div>
                    <div className="text-xs text-slate-500">{m.sku}</div>
                  </Td>
                  <Td className="font-mono text-xs">{m.imei ?? "—"}</Td>
                  <Td className={`text-right font-medium tabular-nums ${m.quantity > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </Td>
                  <Td className="text-right tabular-nums">{m.balanceAfter}</Td>
                  <Td className="text-xs">{m.user ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
