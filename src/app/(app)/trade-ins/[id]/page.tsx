import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Alert, Badge, Card, CardHeader, DetailList, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { firstParam, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { getTradeInDetail, SELLER_ID_LABELS } from "@/modules/sales";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "Trade-in" };

export default async function TradeInPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "tradeins.view")) return <NoAccess />;
  const { id } = await params;
  const sp = await searchParams;
  const showIdentity = can(ctx.role, "tradeins.viewIdentity");
  const [profile, t] = await Promise.all([getBusinessProfile(ctx.db), getTradeInDetail(ctx.db, id, { showIdentity })]);
  const money = (c: number) => formatMoney(c, profile.currency);

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link href="/trade-ins" className="text-indigo-600 hover:underline">
            ← Trade-ins
          </Link>
        }
        title={t.number}
        description={`${formatDateTime(t.createdAt)} · ${t.outlet.code} · by ${t.createdBy}`}
        actions={
          <a href={`/trade-in-slip/${t.id}?print=1`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Icon name="printer" className="h-4 w-4" /> Print slip for signature
          </a>
        }
      />
      {firstParam(sp.created) === "1" ? (
        <Alert tone="green">
          Saved and added to stock. Print the slip and let the seller sign it — keep the signed copy.
        </Alert>
      ) : null}

      <Card>
        <DetailList
          items={[
            { label: "Seller", value: t.seller.name },
            { label: "Phone", value: t.seller.phone ?? "—" },
            {
              label: "ID",
              value: t.seller.idType
                ? `${SELLER_ID_LABELS[t.seller.idType]} ${t.seller.idNumber ?? t.seller.idNumberMasked ?? ""}`
                : "—",
            },
            { label: "Address", value: t.seller.address ?? "—" },
            { label: "Police screening", value: t.policeScreened ? `Done${t.policeReference ? ` · ${t.policeReference}` : ""}` : "Not recorded" },
            { label: "Booking / quote no.", value: t.bookingRef ?? "—" },
            {
              label: "Paid as",
              value:
                t.settlement === "SALE_CREDIT" && t.sale ? (
                  <Link href={`/sales/${t.sale.id}`} className="text-indigo-600 hover:underline">
                    Trade-in credit on sale {t.sale.number}
                  </Link>
                ) : (
                  `${t.paymentMethodName ?? "—"}${t.payoutReference ? ` · ${t.payoutReference}` : ""}`
                ),
            },
            { label: "Total", value: <span className="font-semibold">{money(t.totalCents)}</span> },
            { label: "Notes", value: t.notes ?? "—" },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Devices" description="Now in stock at this outlet; the cost is the trade-in price." />
        <Table>
          <thead>
            <tr>
              <Th>Device</Th>
              <Th>IMEI / Serial</Th>
              <Th>Grade</Th>
              <Th>Battery</Th>
              <Th>Issues found</Th>
              <Th className="text-right">Price</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.items.map((i) => (
              <tr key={i.id}>
                <Td>{i.description}</Td>
                <Td>
                  <Link href={`/inventory/units/${i.stockUnitId}`} className="font-mono text-xs text-indigo-600 hover:underline">
                    {i.identifier}
                  </Link>
                </Td>
                <Td>{i.grade ?? "—"}</Td>
                <Td>{i.batteryHealth !== null ? `${i.batteryHealth}%` : "—"}</Td>
                <Td>
                  {i.issues.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {i.issues.map((issue) => (
                        <Badge key={issue} tone="amber">
                          {issue}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">None</span>
                  )}
                </Td>
                <Td className="text-right tabular-nums">{money(i.priceCents)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
