import { enumParam, readJson, searchParam, tenantRoute } from "@/lib/api/handler";
import { assertCan } from "@/lib/service-context";
import { createProduct, listProducts } from "@/modules/products";

const TYPES = ["SERIALIZED", "NON_SERIALIZED", "SERVICE"] as const;

export const GET = tenantRoute(async ({ req, ctx }) => {
  assertCan(ctx, "products.view");
  return listProducts(ctx.db, {
    q: searchParam(req, "q"),
    type: enumParam(req, "type", TYPES),
    includeInactive: searchParam(req, "inactive") === "1",
  });
});

export const POST = tenantRoute(async ({ req, ctx }) => createProduct(ctx, await readJson(req)));
