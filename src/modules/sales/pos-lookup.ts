import type { TenantTx } from "@/lib/db/tenant";
import { findUnitByIdentifier, normalizeIdentifier, UNIT_STATUS_LABELS } from "@/modules/inventory";
import { searchVariants, variantLabel, type VariantSearchResult } from "@/modules/products";

export type PosUnit = {
  stockUnitId: string;
  variantId: string;
  sku: string;
  label: string;
  imei: string | null;
  serialNumber: string | null;
  grade: string | null;
  batteryHealth: number | null;
  priceCents: number;
  /** Sellable here, right now */
  available: boolean;
  message: string | null;
};

export type PosLookupResult =
  | { kind: "unit"; unit: PosUnit }
  | { kind: "variants"; variants: VariantSearchResult[] }
  | { kind: "none"; message: string };

/** Scanner / search box on the POS: IMEI → that exact phone; otherwise SKU, barcode or name search. */
export async function posLookup(db: TenantTx, outletId: string, rawQuery: string): Promise<PosLookupResult> {
  const query = rawQuery.trim();
  if (!query) return { kind: "variants", variants: [] };

  const identifier = normalizeIdentifier(query);
  if (/^[A-Z0-9]{5,40}$/.test(identifier)) {
    const unit = await findUnitByIdentifier(db, identifier);
    if (unit) {
      let message: string | null = null;
      if (unit.status !== "IN_STOCK") message = `This unit is ${UNIT_STATUS_LABELS[unit.status].toLowerCase()}`;
      else if (unit.outletId !== outletId) message = `This unit is at ${unit.outlet.code} · ${unit.outlet.name}`;
      else if (!unit.variant.isActive || !unit.variant.product.isActive) message = "This product is inactive";
      return {
        kind: "unit",
        unit: {
          stockUnitId: unit.id,
          variantId: unit.variantId,
          sku: unit.variant.sku,
          label: variantLabel(unit.variant.product.name, unit.variant),
          imei: unit.imei,
          serialNumber: unit.serialNumber,
          grade: unit.grade,
          batteryHealth: unit.batteryHealth,
          priceCents: unit.priceCents ?? unit.variant.priceCents,
          available: message === null,
          message,
        },
      };
    }
  }

  const variants = await searchVariants(db, { q: query, outletId, take: 20 });
  if (variants.length === 0) return { kind: "none", message: `Nothing found for "${query}"` };
  return { kind: "variants", variants };
}
