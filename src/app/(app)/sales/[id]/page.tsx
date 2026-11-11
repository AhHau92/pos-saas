import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Card, CardHeader, DetailList, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { getSaleDetail, listPaymentMethods } from "@/modules/sales";
import { getBusinessProfile } from "@/modules/settings";
import { RefundPanel } from "./refund-panel";

export const metadata: Metadata = { title: "Sale" };

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "sales.view")) return <NoAccess />;
  const { id } = await params;
  const [profile, sale, methods] = await Promise.all([
    getBusinessProfile(ctx.db),
    getSaleDetail(ctx.db, id),
    listPaymentMethods(ctx.db),
  ]);
  const money = (c: number) => formatMoney(c, profile.currency);
  const canRefund = can(ctx.role, "sales.refund") && sale.status !== "REFUNDED";
  const showCost = can(ctx.role, "reports.view");

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link href="/sales" className="text-indigo-600 hover:underline">
            ← Sales
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {sale.number} <StatusBadge status={sale.status} />
          </span>
        }
        description={`${formatDateTime(sale.createdAt)} · ${sale.outlet.code} · cashier ${sale.cashier}`}
        actions={
          <a href={`/receipt/${sale.id}?print=1`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Icon name="printer" className="h-4 w-4" /> Print receipt
          </a>
        }
      />

      <Card>
        <DetailList
          items={[
            { label: "Customer", value: sale.customer ? `${sale.customer.name}${sale.customer.phone ? ` · ${sale.customer.phone}` : ""}` : "Walk-in" },
            { label: "Total", value: money(sale.totalCents) },
            { label: "Refunded", value: sale.refundedCents > 0 ? money(sale.refundedCents) : "—" },
            { label: "Paid", value: money(sale.paidCents) },
            { label: "Change", value: money(sale.changeCents) },
            { label: "Notes", value: sale.notes ?? "—" },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Items" />
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>IMEI / Serial</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Price</Th>
              <Th className="text-right">Discount</Th>
              <Th className="text-right">Total</Th>
              {showCost ? <Th className="text-right">Cost</Th> : null}
              <Th className="text-right">Refunded</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sale.items.map((i) => (
              <tr key={i.id}>
                <Td>
                  <div className="font-medium text-slate-900">{i.description}</div>
                  <div className="text-xs text-slate-500">{i.sku}</div>
                </Td>
                <Td>
                  {i.stockUnitId ? (
                    <Link href={`/inventory/units/${i.stockUnitId}`} className="font-mono text-xs text-indigo-600 hover:underline">
                      {i.imei}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-right tabular-nums">{i.quantity}</Td>
                <Td className="text-right tabular-nums">{money(i.unitPriceCents)}</Td>
                <Td className="text-right tabular-nums">{i.discountCents > 0 ? money(i.discountCents) : "—"}</Td>
                <Td className="text-right tabular-nums">{money(i.totalCents)}</Td>
                {showCost ? <Td className="text-right tabular-nums text-slate-500">{money(i.unitCostCents * i.quantity)}</Td> : null}
                <Td className="text-right tabular-nums">{i.refundedQuantity > 0 ? `${i.refundedQuantity} · ${money(i.refundedCents)}` : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3 text-sm">
          <dl className="w-64 space-y-1">
            <div className="flex justify-between text-slate-600">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{money(sale.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>
                {sale.taxInclusive ? "Incl. " : ""}
                {profile.taxName} {sale.taxRateBps / 100}%
              </dt>
              <dd className="tabular-nums">{money(sale.taxCents)}</dd>
            </div>
            <div className="flex justify-between font-semibold text-slate-900">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(sale.totalCents)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Payments" />
          <ul className="divide-y divide-slate-100 text-sm">
            {sale.payments.map((p) => (
              <li key={p.id} className="flex justify-between px-5 py-2.5">
                <span>
                  {p.methodName}
                  {p.reference ? <span className="text-slate-500"> · {p.reference}</span> : null}
                  {p.tenderedCents !== null && p.tenderedCents !== p.amountCents ? (
                    <span className="text-slate-500"> · tendered {money(p.tenderedCents)}</span>
                  ) : null}
                </span>
                <span className="tabular-nums">{money(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Refunds" />
          {sale.refunds.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">No refunds.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {sale.refunds.map((r) => (
                <li key={r.id} className="px-5 py-3">
                  <div className="flex justify-between">
                    <span className="font-medium">{r.number}</span>
                    <span className="tabular-nums text-rose-600">−{money(r.totalCents)}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatDateTime(r.createdAt)} · {r.methodName} · by {r.createdBy}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                  <ul className="mt-1 text-xs text-slate-600">
                    {r.items.map((ri, index) => (
                      <li key={index}>
                        {ri.quantity} × {ri.description} ({ri.disposition === "RESTOCK" ? "back to stock" : "defective"})
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canRefund ? (
        <RefundPanel
          saleId={sale.id}
          currency={profile.currency}
          items={sale.items.map((i) => ({
            id: i.id,
            description: i.description,
            imei: i.imei,
            serialized: i.stockUnitId !== null,
            quantity: i.quantity,
            refundedQuantity: i.refundedQuantity,
            totalCents: i.totalCents,
            refundedCents: i.refundedCents,
          }))}
          paymentMethods={methods.map((m) => ({ id: m.id, name: m.name }))}
        />
      ) : null}
    </div>
  );
}
