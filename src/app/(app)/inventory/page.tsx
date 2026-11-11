import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { NoAccess } from "@/components/no-access";
import { buttonClass } from "@/components/ui/button";
import { inputClass, selectClass } from "@/components/ui/form";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { firstParam, type SearchParams } from "@/lib/page";
import { getStockMatrix } from "@/modules/inventory";

export const metadata: Metadata = { title: "Stock by outlet" };

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "inventory.view")) return <NoAccess />;
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const show = firstParam(sp.show) ?? "instock";
  const low = firstParam(sp.low) === "1";
  const matrix = await getStockMatrix(ctx.db, { q, onlyInStock: show === "instock" && !low, lowStockOnly: low });

  return (
    <div>
      <PageHeader
        title="Stock by outlet"
        description="Sellable quantity per outlet. In transit = dispatched transfers not yet received."
        actions={
          can(ctx.role, "inventory.adjust") ? (
            <Link href="/inventory/adjustments/new" className={buttonClass("secondary")}>
              Stock adjustment
            </Link>
          ) : null
        }
      />
      <FilterBar>
        <FilterField label="Search">
          <input name="q" defaultValue={q} placeholder="Product, SKU, colour, storage" className={`${inputClass} w-72`} />
        </FilterField>
        <FilterField label="Show">
          <select name="show" defaultValue={show} className={selectClass}>
            <option value="instock">With stock</option>
            <option value="all">All SKUs</option>
          </select>
        </FilterField>
        <FilterField label="Low stock">
          <select name="low" defaultValue={low ? "1" : ""} className={selectClass}>
            <option value="">—</option>
            <option value="1">Only low stock</option>
          </select>
        </FilterField>
      </FilterBar>
      <Card>
        {matrix.rows.length === 0 ? (
          <EmptyState title="Nothing to show">Receive a purchase order or add opening stock to get started.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                {matrix.outlets.map((o) => (
                  <Th key={o.id} className="text-right">
                    <span title={o.name}>{o.code}</span>
                  </Th>
                ))}
                <Th className="text-right">In transit</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matrix.rows.map((r) => (
                <tr key={r.variantId} className="hover:bg-slate-50">
                  <Td>
                    <div className="font-medium text-slate-900">{r.label}</div>
                    <div className="text-xs text-slate-500">
                      {r.brandName ?? ""} {r.productType === "SERIALIZED" ? <Badge tone="indigo">IMEI</Badge> : null}
                    </div>
                  </Td>
                  <Td className="font-mono text-xs">{r.sku}</Td>
                  {matrix.outlets.map((o) => {
                    const qty = r.byOutlet[o.id] ?? 0;
                    const isLow = r.minStock > 0 && qty <= r.minStock;
                    return (
                      <Td key={o.id} className={`text-right tabular-nums ${qty === 0 ? "text-slate-300" : ""} ${isLow ? "font-semibold text-amber-600" : ""}`}>
                        {r.productType === "SERIALIZED" && qty > 0 ? (
                          <Link href={`/inventory/units?variantId=${r.variantId}&outletId=${o.id}&status=IN_STOCK`} className="hover:underline">
                            {qty}
                          </Link>
                        ) : (
                          qty
                        )}
                      </Td>
                    );
                  })}
                  <Td className="text-right tabular-nums text-sky-700">{r.inTransit || ""}</Td>
                  <Td className="text-right font-semibold tabular-nums">{r.total}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
