import type { Prisma } from "@/generated/tenant/client";
import type { TenantTx } from "@/lib/db/tenant";
import { NotFoundError } from "@/lib/errors";
import { variantLabel, type ConditionValue, type ProductTypeValue } from "./sku";

export type ProductListItem = {
  id: string;
  name: string;
  type: ProductTypeValue;
  brandName: string | null;
  categoryName: string | null;
  isActive: boolean;
  variantCount: number;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  totalStock: number;
};

/** Each search word must match somewhere (name, brand, SKU, barcode, colour, storage). */
function variantSearchWhere(q: string | undefined): Prisma.ProductVariantWhereInput[] {
  if (!q) return [];
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((word): Prisma.ProductVariantWhereInput => ({
      OR: [
        { sku: { contains: word, mode: "insensitive" } },
        { barcode: { equals: word } },
        { color: { contains: word, mode: "insensitive" } },
        { storage: { contains: word, mode: "insensitive" } },
        { product: { name: { contains: word, mode: "insensitive" } } },
        { product: { brand: { name: { contains: word, mode: "insensitive" } } } },
      ],
    }));
}

export async function listProducts(
  db: TenantTx,
  options: { q?: string; type?: ProductTypeValue; includeInactive?: boolean; take?: number } = {},
): Promise<ProductListItem[]> {
  const where: Prisma.ProductWhereInput = {
    AND: [
      options.includeInactive ? {} : { isActive: true },
      options.type ? { type: options.type } : {},
      options.q
        ? {
            OR: [
              { name: { contains: options.q, mode: "insensitive" } },
              { brand: { name: { contains: options.q, mode: "insensitive" } } },
              { variants: { some: { sku: { contains: options.q, mode: "insensitive" } } } },
              { variants: { some: { barcode: { equals: options.q } } } },
            ],
          }
        : {},
    ],
  };
  const rows = await db.product.findMany({
    where,
    orderBy: [{ name: "asc" }],
    take: options.take ?? 300,
    include: {
      brand: true,
      category: true,
      variants: { where: { isActive: true }, include: { stockLevels: true } },
    },
  });
  return rows.map((p) => {
    const prices = p.variants.map((v) => v.priceCents);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      brandName: p.brand?.name ?? null,
      categoryName: p.category?.name ?? null,
      isActive: p.isActive,
      variantCount: p.variants.length,
      minPriceCents: prices.length ? Math.min(...prices) : null,
      maxPriceCents: prices.length ? Math.max(...prices) : null,
      totalStock: p.variants.reduce((sum, v) => sum + v.stockLevels.reduce((s, l) => s + l.quantity, 0), 0),
    };
  });
}

export type VariantDTO = {
  id: string;
  sku: string;
  barcode: string | null;
  color: string | null;
  storage: string | null;
  ram: string | null;
  condition: ConditionValue;
  priceCents: number;
  costCents: number;
  minStock: number;
  isActive: boolean;
  label: string;
};

export type ProductDetail = {
  id: string;
  name: string;
  type: ProductTypeValue;
  brandName: string | null;
  categoryName: string | null;
  description: string | null;
  isActive: boolean;
  variants: VariantDTO[];
};

export async function getProductDetail(db: TenantTx, id: string): Promise<ProductDetail> {
  const p = await db.product.findUnique({
    where: { id },
    include: { brand: true, category: true, variants: { orderBy: [{ isActive: "desc" }, { sku: "asc" }] } },
  });
  if (!p) throw new NotFoundError("Product not found");
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    brandName: p.brand?.name ?? null,
    categoryName: p.category?.name ?? null,
    description: p.description,
    isActive: p.isActive,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode,
      color: v.color,
      storage: v.storage,
      ram: v.ram,
      condition: v.condition,
      priceCents: v.priceCents,
      costCents: v.costCents,
      minStock: v.minStock,
      isActive: v.isActive,
      label: variantLabel(p.name, v),
    })),
  };
}

export type VariantSearchResult = {
  variantId: string;
  productId: string;
  sku: string;
  barcode: string | null;
  label: string;
  productName: string;
  brandName: string | null;
  productType: ProductTypeValue;
  condition: ConditionValue;
  priceCents: number;
  costCents: number;
  /** Sellable quantity at the requested outlet (null for services / when no outlet given) */
  onHand: number | null;
};

/** Typeahead search used by the POS, purchase orders, transfers and adjustments. */
export async function searchVariants(
  db: TenantTx,
  options: { q?: string; outletId?: string; types?: ProductTypeValue[]; take?: number },
): Promise<VariantSearchResult[]> {
  const q = options.q?.trim();
  const rows = await db.productVariant.findMany({
    where: {
      isActive: true,
      product: { isActive: true, ...(options.types ? { type: { in: options.types } } : {}) },
      AND: variantSearchWhere(q),
    },
    include: {
      product: { include: { brand: true } },
      stockLevels: { where: { outletId: options.outletId } },
    },
    orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    take: options.take ?? 20,
  });
  const results = rows.map((v) => ({
    variantId: v.id,
    productId: v.productId,
    sku: v.sku,
    barcode: v.barcode,
    label: variantLabel(v.product.name, v),
    productName: v.product.name,
    brandName: v.product.brand?.name ?? null,
    productType: v.product.type,
    condition: v.condition,
    priceCents: v.priceCents,
    costCents: v.costCents,
    onHand:
      options.outletId && v.product.type !== "SERVICE"
        ? v.stockLevels.reduce((s, l) => s + l.quantity, 0)
        : null,
  }));
  // exact SKU / barcode matches first (barcode scanners)
  if (q) {
    const upper = q.toUpperCase();
    results.sort((a, b) => {
      const ea = a.sku === upper || a.barcode === q ? 0 : 1;
      const eb = b.sku === upper || b.barcode === q ? 0 : 1;
      return ea - eb;
    });
  }
  return results;
}

export async function listBrandNames(db: TenantTx): Promise<string[]> {
  const rows = await db.brand.findMany({ orderBy: { name: "asc" }, take: 500 });
  return rows.map((b) => b.name);
}

export async function listCategoryNames(db: TenantTx): Promise<string[]> {
  const rows = await db.category.findMany({ orderBy: { name: "asc" }, take: 500 });
  return rows.map((c) => c.name);
}
