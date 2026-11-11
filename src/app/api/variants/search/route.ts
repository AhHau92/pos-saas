import { intParam, searchParam, tenantRoute } from "@/lib/api/handler";
import { assertCan } from "@/lib/service-context";
import { searchVariants, type ProductTypeValue } from "@/modules/products";

const TYPES: readonly ProductTypeValue[] = ["SERIALIZED", "NON_SERIALIZED", "SERVICE"];

/** Typeahead: GET /api/variants/search?q=iphone&types=SERIALIZED,NON_SERIALIZED&outletId=... */
export const GET = tenantRoute(async ({ req, ctx }) => {
  assertCan(ctx, "products.view");
  const types = searchParam(req, "types")
    ?.split(",")
    .filter((t): t is ProductTypeValue => (TYPES as readonly string[]).includes(t));
  return searchVariants(ctx.db, {
    q: searchParam(req, "q"),
    outletId: searchParam(req, "outletId") ?? ctx.outletId,
    types: types && types.length > 0 ? types : undefined,
    take: intParam(req, "take", 20, 1, 50),
  });
});
