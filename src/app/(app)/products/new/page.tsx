import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { ProductForm } from "@/components/products/product-form";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listBrandNames, listCategoryNames } from "@/modules/products";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "products.manage")) return <NoAccess />;
  const [brandNames, categoryNames] = await Promise.all([listBrandNames(ctx.db), listCategoryNames(ctx.db)]);
  return (
    <div>
      <PageHeader
        back={
          <Link href="/products" className="text-indigo-600 hover:underline">
            ← Products
          </Link>
        }
        title="New product"
      />
      <ProductForm brandNames={brandNames} categoryNames={categoryNames} />
    </div>
  );
}
