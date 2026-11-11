/** SKU / label helpers. Pure module (used by forms and services). */

export type ConditionValue = "NEW" | "USED" | "REFURBISHED";
export type ProductTypeValue = "SERIALIZED" | "NON_SERIALIZED" | "SERVICE";

export const CONDITION_LABELS: Record<ConditionValue, string> = {
  NEW: "New",
  USED: "Used",
  REFURBISHED: "Refurbished",
};

export const PRODUCT_TYPE_LABELS: Record<ProductTypeValue, string> = {
  SERIALIZED: "IMEI / serial tracked",
  NON_SERIALIZED: "Quantity (accessory)",
  SERVICE: "Service (no stock)",
};

const CONDITION_CODE: Record<ConditionValue, string> = { NEW: "NEW", USED: "USED", REFURBISHED: "REF" };

function token(value: string | null | undefined, max: number): string {
  if (!value) return "";
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, max);
}

/** e.g. Apple / iPhone 16 Pro / 256GB / Black Titanium / NEW → APPLE-IPHONE16PRO-256GB-BLAC-NEW */
export function suggestSku(input: {
  brand?: string | null;
  name: string;
  storage?: string | null;
  color?: string | null;
  condition?: ConditionValue | null;
}): string {
  const brand = input.brand?.trim() ?? "";
  let name = input.name.trim();
  if (brand && name.toLowerCase().startsWith(brand.toLowerCase())) {
    name = name.slice(brand.length).trim() || name;
  }
  const parts = [
    token(brand, 5),
    token(name, 14),
    token(input.storage, 6),
    token(input.color, 4),
    CONDITION_CODE[input.condition ?? "NEW"],
  ].filter(Boolean);
  return parts.join("-") || "SKU";
}

/** e.g. "Galaxy S25 12GB/256GB Navy (Used)" */
export function variantLabel(
  productName: string,
  variant: { color?: string | null; storage?: string | null; ram?: string | null; condition?: ConditionValue | null },
): string {
  const memory =
    variant.ram && variant.storage ? `${variant.ram}/${variant.storage}` : (variant.storage ?? variant.ram ?? null);
  let label = [productName, memory, variant.color].filter(Boolean).join(" ");
  if (variant.condition && variant.condition !== "NEW") label += ` (${CONDITION_LABELS[variant.condition]})`;
  return label;
}
