import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { NoAccess } from "@/components/no-access";
import { buttonClass } from "@/components/ui/button";
import { selectClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { firstParam, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { listTransfers, type TransferStatusValue } from "@/modules/transfers";

export const metadata: Metadata = { title: "Stock transfers" };

const STATUSES: TransferStatusValue[] = ["DRAFT", "IN_TRANSIT", "RECEIVED", "CANCELLED"];

export default async function TransfersPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "transfers.view")) return <NoAccess />;
  const sp = await searchParams;
  const directionParam = firstParam(sp.direction);
  const direction = directionParam === "in" || directionParam === "out" ? directionParam : "all";
  const statusParam = firstParam(sp.status);
  const status = STATUSES.find((s) => s === statusParam);
  const scopeAll = can(ctx.role, "outlets.switch") && firstParam(sp.scope) === "all";
  const transfers = await listTransfers(ctx.db, { outletId: scopeAll ? undefined : ctx.outletId, direction, status });

  return (
    <div>
      <PageHeader
        title="Stock transfers"
        description={scopeAll ? "All outlets" : `Transfers in and out of ${ctx.outlet.code}`}
        actions={
          can(ctx.role, "transfers.manage") ? (
            <Link href="/transfers/new" className={buttonClass("primary")}>
              <Icon name="plus" className="h-4 w-4" /> New transfer
            </Link>
          ) : null
        }
      />
      <FilterBar>
        <FilterField label="Direction">
          <select name="direction" defaultValue={direction} className={selectClass}>
            <option value="all">In &amp; out</option>
            <option value="in">Incoming</option>
            <option value="out">Outgoing</option>
          </select>
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
        {can(ctx.role, "outlets.switch") ? (
          <FilterField label="Scope">
            <select name="scope" defaultValue={scopeAll ? "all" : ""} className={selectClass}>
              <option value="">Current outlet</option>
              <option value="all">All outlets</option>
            </select>
          </FilterField>
        ) : null}
      </FilterBar>
      <Card>
        {transfers.length === 0 ? (
          <EmptyState title="No transfers" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>From → To</Th>
                <Th>Status</Th>
                <Th className="text-right">Qty</Th>
                <Th>Created</Th>
                <Th>Dispatched</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/transfers/${t.id}`} className="font-medium text-indigo-600 hover:underline">
                      {t.number}
                    </Link>
                  </Td>
                  <Td>
                    {t.fromOutlet} → {t.toOutlet}
                    {t.toOutletId === ctx.outletId && t.status === "IN_TRANSIT" ? (
                      <span className="ml-2 text-xs font-medium text-sky-700">incoming</span>
                    ) : null}
                  </Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td className="text-right tabular-nums">{t.quantity}</Td>
                  <Td className="text-xs">{formatDateTime(t.createdAt)}</Td>
                  <Td className="text-xs">{t.dispatchedAt ? formatDateTime(t.dispatchedAt) : "—"}</Td>
                  <Td className="text-xs">{t.receivedAt ? formatDateTime(t.receivedAt) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
