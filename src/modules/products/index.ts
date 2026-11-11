export { createProduct, updateProduct, setVariantCost } from "./products.service";
export {
  listProducts,
  getProductDetail,
  searchVariants,
  listBrandNames,
  listCategoryNames,
  type ProductListItem,
  type ProductDetail,
  type VariantDTO,
  type VariantSearchResult,
} from "./products.queries";
export {
  suggestSku,
  variantLabel,
  CONDITION_LABELS,
  PRODUCT_TYPE_LABELS,
  type ConditionValue,
  type ProductTypeValue,
} from "./sku";
