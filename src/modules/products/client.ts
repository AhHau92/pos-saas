/**
 * Client-safe exports of the products module (no database code).
 * Client components import from "@/modules/products/client", never from "@/modules/products".
 */
export { suggestSku, variantLabel, CONDITION_LABELS, PRODUCT_TYPE_LABELS } from "./sku";
export type { ConditionValue, ProductTypeValue } from "./sku";
export type { VariantSearchResult, ProductDetail, VariantDTO } from "./products.queries";
