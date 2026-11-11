import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/time";
import { ADJUSTMENT_REASON_LABELS, listAdjustments, type AdjustmentReasonValue } from "@/modules/inventory";

export const metadata: Metadata = { title: "Stock adjustments" };

export default async function AdjustmentsPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "inventory.adjust")) return <NoAccess />;
  const adjustments = await listAdjustments(ctx.db, 100);
  return (
    <div>
      <PageHeader
        title="Stock adjustments"
        description="Opening stock, stock counts, damaged / lost items and IMEI status changes. Details are in the stock ledger."
        actions={
          <Link href="/inventory/adjustments/new" className={buttonClass("primary")}>
            <Icon name="plus" className="h-4 w-4" /> New adjustment
          </Link>
        }
      />
      <Card>
        {adjustments.length === 0 ? (
          <EmptyState title="No adjustments yet">
            Tip: use <b>Stock in → Opening stock</b> to load the phones and accessories you already have.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Date</Th>
                <Th>Outlet</Th>
                <Th>Reason</Th>
                <Th>Note</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <Link href={`/inventory/movements?q=${encodeURIComponent(a.number)}&outlet=all&from=2000-01-01`} className="font-medium text-indigo-600 hover:underline">
                      {a.number}
                    </Link>
                  </Td>
                  <Td>{formatDateTime(a.at)}</Td>
                  <Td>{a.outletCode}</Td>
                  <Td>{ADJUSTMENT_REASON_LABELS[a.reason as AdjustmentReasonValue] ?? a.reason}</Td>
                  <Td className="text-slate-500">{a.note ?? "—"}</Td>
                  <Td>{a.user}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
