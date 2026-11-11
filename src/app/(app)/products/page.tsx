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
import { listProducts, PRODUCT_TYPE_LABELS, type ProductTypeValue } from "@/modules/products";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "Products" };

const TYPES: ProductTypeValue[] = ["SERIALIZED", "NON_SERIALIZED", "SERVICE"];

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "products.view")) return <NoAccess />;
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const typeParam = firstParam(sp.type);
  const type = TYPES.find((t) => t === typeParam);
  const includeInactive = firstParam(sp.inactive) === "1";
  const [profile, products] = await Promise.all([
    getBusinessProfile(ctx.db),
    listProducts(ctx.db, { q, type, includeInactive }),
  ]);
  const money = (c: number) => formatMoney(c, profile.currency);

  return (
    <div>
      <PageHeader
        title="Products"
        description="Models and their variants (colour / storage / condition)"
        actions={
          can(ctx.role, "products.manage") ? (
            <Link href="/products/new" className={buttonClass("primary")}>
              <Icon name="plus" className="h-4 w-4" /> New product
            </Link>
          ) : null
        }
      />
      <FilterBar>
        <FilterField label="Search">
          <input name="q" defaultValue={q} placeholder="Name, brand, SKU, barcode" className={`${inputClass} w-72`} />
        </FilterField>
        <FilterField label="Type">
          <select name="type" defaultValue={type ?? ""} className={selectClass}>
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {PRODUCT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select name="inactive" defaultValue={includeInactive ? "1" : ""} className={selectClass}>
            <option value="">Active only</option>
            <option value="1">Include inactive</option>
          </select>
        </FilterField>
      </FilterBar>
      <Card>
        {products.length === 0 ? (
          <EmptyState title="No products yet">Create your first product, e.g. “iPhone 16 Pro”.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Brand</Th>
                <Th>Category</Th>
                <Th>Tracking</Th>
                <Th className="text-right">Variants</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Stock (all outlets)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/products/${p.id}`} className="font-medium text-indigo-600 hover:underline">
                      {p.name}
                    </Link>
                    {!p.isActive ? (
                      <span className="ml-2">
                        <Badge>Inactive</Badge>
                      </span>
                    ) : null}
                  </Td>
                  <Td>{p.brandName ?? "—"}</Td>
                  <Td>{p.categoryName ?? "—"}</Td>
                  <Td>
                    <Badge tone={p.type === "SERIALIZED" ? "indigo" : p.type === "SERVICE" ? "purple" : "gray"}>
                      {p.type === "SERIALIZED" ? "IMEI" : p.type === "SERVICE" ? "Service" : "Quantity"}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{p.variantCount}</Td>
                  <Td className="text-right tabular-nums">
                    {p.minPriceCents === null
                      ? "—"
                      : p.minPriceCents === p.maxPriceCents
                        ? money(p.minPriceCents)
                        : `${money(p.minPriceCents)} – ${money(p.maxPriceCents ?? p.minPriceCents)}`}
                  </Td>
                  <Td className="text-right tabular-nums">{p.type === "SERVICE" ? "—" : p.totalStock}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
