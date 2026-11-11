import { searchParam, tenantRoute } from "@/lib/api/handler";
import { ValidationError } from "@/lib/errors";
import { assertCan } from "@/lib/service-context";
import { listAvailableUnits } from "@/modules/inventory";

/** IN_STOCK units of one SKU at an outlet (POS IMEI picker). */
export const GET = tenantRoute(async ({ req, ctx }) => {
  assertCan(ctx, "inventory.view");
  const variantId = searchParam(req, "variantId");
  if (!variantId) throw new ValidationError("variantId is required");
  return listAvailableUnits(ctx.db, { variantId, outletId: searchParam(req, "outletId") ?? ctx.outletId });
});
