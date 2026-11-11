import { z } from "zod";
import type { TenantTx } from "@/lib/db/tenant";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { centsSchema, emptyToNull, idSchema, optionalText, parseInput, requiredText } from "@/lib/validation";
import { suggestSku } from "./sku";

const CONDITIONS = ["NEW", "USED", "REFURBISHED"] as const;
const TYPES = ["SERIALIZED", "NON_SERIALIZED", "SERVICE"] as const;

const variantSchema = z.object({
  /** Present when updating an existing variant */
  id: idSchema.optional(),
  /** Blank = generate automatically */
  sku: z.string().trim().max(64).optional().nullable(),
  barcode: optionalText(64),
  color: optionalText(40),
  storage: optionalText(20),
  ram: optionalText(20),
  condition: z.enum(CONDITIONS),
  priceCents: centsSchema,
  costCents: centsSchema.optional(),
  minStock: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});

const productSchema = z.object({
  name: requiredText(120),
  type: z.enum(TYPES),
  brandName: optionalText(60),
  categoryName: optionalText(60),
  description: optionalText(1000),
  isActive: z.boolean().optional(),
  variants: z.array(variantSchema).min(1, "Add at least one variant (SKU)").max(200),
});

type VariantInput = z.infer<typeof variantSchema>;

async function findOrCreateBrand(tx: TenantTx, name: string | null): Promise<string | null> {
  if (!name) return null;
  const existing = await tx.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) return existing.id;
  return (await tx.brand.create({ data: { name } })).id;
}

async function findOrCreateCategory(tx: TenantTx, name: string | null): Promise<string | null> {
  if (!name) return null;
  const existing = await tx.category.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) return existing.id;
  return (await tx.category.create({ data: { name } })).id;
}

/** Ensures SKUs / barcodes in the submission are unique among themselves. */
function assertNoDuplicatesInInput(variants: VariantInput[]): void {
  const skus = new Set<string>();
  const barcodes = new Set<string>();
  for (const v of variants) {
    const sku = v.sku?.trim().toUpperCase();
    if (sku) {
      if (skus.has(sku)) throw new ValidationError(`SKU ${sku} is used twice`);
      skus.add(sku);
    }
    const barcode = v.barcode?.trim();
    if (barcode) {
      if (barcodes.has(barcode)) throw new ValidationError(`Barcode ${barcode} is used twice`);
      barcodes.add(barcode);
    }
  }
}

async function resolveSku(
  tx: TenantTx,
  variant: VariantInput,
  context: { productName: string; brandName: string | null; excludeVariantId?: string },
): Promise<string> {
  const requested = variant.sku?.trim().toUpperCase();
  if (requested) {
    const clash = await tx.productVariant.findUnique({ where: { sku: requested } });
    if (clash && clash.id !== context.excludeVariantId) throw new ConflictError(`SKU ${requested} already exists`);
    return requested;
  }
  const base = suggestSku({
    brand: context.brandName,
    name: context.productName,
    storage: variant.storage,
    color: variant.color,
    condition: variant.condition,
  });
  for (let attempt = 1; attempt < 1000; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const clash = await tx.productVariant.findUnique({ where: { sku: candidate } });
    if (!clash || clash.id === context.excludeVariantId) return candidate;
  }
  throw new ConflictError("Could not generate a unique SKU; please enter one");
}

async function assertBarcodeFree(tx: TenantTx, barcode: string | null, excludeVariantId?: string): Promise<void> {
  if (!barcode) return;
  const clash = await tx.productVariant.findUnique({ where: { barcode } });
  if (clash && clash.id !== excludeVariantId) throw new ConflictError(`Barcode ${barcode} already exists`);
}

function variantValues(v: VariantInput) {
  return {
    barcode: emptyToNull(v.barcode),
    color: emptyToNull(v.color),
    storage: emptyToNull(v.storage),
    ram: emptyToNull(v.ram),
    condition: v.condition,
    priceCents: v.priceCents,
    minStock: v.minStock ?? 0,
    isActive: v.isActive ?? true,
  };
}

export async function createProduct(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  assertCan(ctx, "products.manage");
  const data = parseInput(productSchema, input);
  assertNoDuplicatesInInput(data.variants);
  const brandName = emptyToNull(data.brandName);

  return ctx.db.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: data.name,
        type: data.type,
        brandId: await findOrCreateBrand(tx, brandName),
        categoryId: await findOrCreateCategory(tx, emptyToNull(data.categoryName)),
        description: emptyToNull(data.description),
        isActive: data.isActive ?? true,
      },
    });
    for (const v of data.variants) {
      const values = variantValues(v);
      await assertBarcodeFree(tx, values.barcode);
      await tx.productVariant.create({
        data: {
          ...values,
          productId: product.id,
          sku: await resolveSku(tx, v, { productName: data.name, brandName }),
          costCents: v.costCents ?? 0,
        },
      });
    }
    return { id: product.id };
  });
}

/**
 * Updates a product and its variants. Variants missing from the input are deactivated
 * (never deleted — they may be referenced by stock and sales history).
 */
export async function updateProduct(ctx: ServiceContext, id: string, input: unknown): Promise<{ id: string }> {
  assertCan(ctx, "products.manage");
  const data = parseInput(productSchema, input);
  assertNoDuplicatesInInput(data.variants);
  const brandName = emptyToNull(data.brandName);

  return ctx.db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id }, include: { variants: true } });
    if (!product) throw new NotFoundError("Product not found");

    if (product.type !== data.type) {
      const variantIds = product.variants.map((v) => v.id);
      const [movements, saleItems] = await Promise.all([
        tx.inventoryMovement.count({ where: { variantId: { in: variantIds } } }),
        tx.saleItem.count({ where: { variantId: { in: variantIds } } }),
      ]);
      if (movements > 0 || saleItems > 0) {
        throw new ValidationError("The product type cannot change after stock or sales exist");
      }
    }

    await tx.product.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        brandId: await findOrCreateBrand(tx, brandName),
        categoryId: await findOrCreateCategory(tx, emptyToNull(data.categoryName)),
        description: emptyToNull(data.description),
        isActive: data.isActive ?? true,
      },
    });

    const existingIds = new Set(product.variants.map((v) => v.id));
    const keptIds = new Set<string>();
    for (const v of data.variants) {
      const values = variantValues(v);
      if (v.id) {
        if (!existingIds.has(v.id)) throw new ValidationError("Variant does not belong to this product");
        keptIds.add(v.id);
        await assertBarcodeFree(tx, values.barcode, v.id);
        await tx.productVariant.update({
          where: { id: v.id },
          data: {
            ...values,
            sku: await resolveSku(tx, v, { productName: data.name, brandName, excludeVariantId: v.id }),
            costCents: v.costCents,
          },
        });
      } else {
        await assertBarcodeFree(tx, values.barcode);
        await tx.productVariant.create({
          data: {
            ...values,
            productId: id,
            sku: await resolveSku(tx, v, { productName: data.name, brandName }),
            costCents: v.costCents ?? 0,
          },
        });
      }
    }
    const removed = [...existingIds].filter((variantId) => !keptIds.has(variantId));
    if (removed.length > 0) {
      await tx.productVariant.updateMany({ where: { id: { in: removed } }, data: { isActive: false } });
    }
    return { id };
  });
}

/**
 * Moving-average cost for quantity items, maintained by the inventory module on goods receipt.
 * (ProductVariant belongs to this module, so the write happens here.)
 */
export async function setVariantCost(tx: TenantTx, variantId: string, costCents: number): Promise<void> {
  await tx.productVariant.update({ where: { id: variantId }, data: { costCents: Math.max(0, Math.round(costCents)) } });
}
