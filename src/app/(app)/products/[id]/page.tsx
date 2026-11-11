import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { ProductForm } from "@/components/products/product-form";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { CONDITION_LABELS, getProductDetail, listBrandNames, listCategoryNames, PRODUCT_TYPE_LABELS } from "@/modules/products";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "products.view")) return <NoAccess />;
  const { id } = await params;
  const product = await getProductDetail(ctx.db, id);
  const back = (
    <Link href="/products" className="text-indigo-600 hover:underline">
      ← Products
    </Link>
  );

  if (can(ctx.role, "products.manage")) {
    const [brandNames, categoryNames] = await Promise.all([listBrandNames(ctx.db), listCategoryNames(ctx.db)]);
    return (
      <div>
        <PageHeader
          back={back}
          title={product.name}
          description={PRODUCT_TYPE_LABELS[product.type]}
          actions={
            product.type === "SERIALIZED" ? (
              <Link href={`/inventory/units?q=${encodeURIComponent(product.name)}`} className={buttonClass("secondary")}>
                View IMEI units
              </Link>
            ) : null
          }
        />
        <ProductForm product={product} brandNames={brandNames} categoryNames={categoryNames} />
      </div>
    );
  }

  // read-only view for cashiers
  const profile = await getBusinessProfile(ctx.db);
  return (
    <div>
      <PageHeader back={back} title={product.name} description={PRODUCT_TYPE_LABELS[product.type]} />
      <Card>
        <CardHeader title="Variants" />
        <Table>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Variant</Th>
              <Th>Condition</Th>
              <Th className="text-right">Price</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {product.variants
              .filter((v) => v.isActive)
              .map((v) => (
                <tr key={v.id}>
                  <Td className="font-mono text-xs">{v.sku}</Td>
                  <Td>{v.label}</Td>
                  <Td>
                    <Badge>{CONDITION_LABELS[v.condition]}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{formatMoney(v.priceCents, profile.currency)}</Td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
