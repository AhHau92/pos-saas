import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { NoAccess } from "@/components/no-access";
import { buttonClass } from "@/components/ui/button";
import { inputClass, selectClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { firstParam, type SearchParams } from "@/lib/page";
import { formatDate } from "@/lib/time";
import { listPurchaseOrders, type PurchaseOrderStatusValue } from "@/modules/purchasing";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "Purchase orders" };

const STATUSES: PurchaseOrderStatusValue[] = ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "purchasing.view")) return <NoAccess />;
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const statusParam = firstParam(sp.status);
  const status = STATUSES.find((s) => s === statusParam);
  const [profile, orders] = await Promise.all([getBusinessProfile(ctx.db), listPurchaseOrders(ctx.db, { q, status })]);
  const money = (c: number) => formatMoney(c, profile.currency);

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="Order from suppliers, then receive the goods (scan IMEIs) into stock"
        actions={
          can(ctx.role, "purchasing.manage") ? (
            <Link href="/purchasing/orders/new" className={buttonClass("primary")}>
              <Icon name="plus" className="h-4 w-4" /> New purchase order
            </Link>
          ) : null
        }
      />
      <FilterBar>
        <FilterField label="Search">
          <input name="q" defaultValue={q} placeholder="PO number or supplier" className={`${inputClass} w-64`} />
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={status ?? ""} className={selectClass}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>
      <Card>
        {orders.length === 0 ? (
          <EmptyState title="No purchase orders" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>PO</Th>
                <Th>Supplier</Th>
                <Th>Outlet</Th>
                <Th>Status</Th>
                <Th className="text-right">Received</Th>
                <Th className="text-right">Total</Th>
                <Th>Expected</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/purchasing/orders/${po.id}`} className="font-medium text-indigo-600 hover:underline">
                      {po.number}
                    </Link>
                  </Td>
                  <Td>{po.supplierName}</Td>
                  <Td>{po.outletCode}</Td>
                  <Td>
                    <StatusBadge status={po.status} />
                  </Td>
                  <Td className="text-right tabular-nums">
                    {po.receivedQuantity} / {po.orderedQuantity}
                  </Td>
                  <Td className="text-right tabular-nums">{money(po.totalCents)}</Td>
                  <Td>{po.expectedAt ? formatDate(po.expectedAt) : "—"}</Td>
                  <Td>{formatDate(po.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
