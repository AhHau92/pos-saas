import { readJson, tenantRoute } from "@/lib/api/handler";
import { assertCan } from "@/lib/service-context";
import { getProductDetail, updateProduct } from "@/modules/products";

export const GET = tenantRoute<{ id: string }>(async ({ ctx, params }) => {
  assertCan(ctx, "products.view");
  return getProductDetail(ctx.db, params.id);
});

export const PUT = tenantRoute<{ id: string }>(async ({ req, ctx, params }) =>
  updateProduct(ctx, params.id, await readJson(req)),
);
