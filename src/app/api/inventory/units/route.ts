import { enumParam, intParam, searchParam, tenantRoute } from "@/lib/api/handler";
import { assertCan } from "@/lib/service-context";
import { searchUnits, UNIT_STATUSES } from "@/modules/inventory";

export const GET = tenantRoute(async ({ req, ctx }) => {
  assertCan(ctx, "inventory.view");
  return searchUnits(ctx.db, {
    q: searchParam(req, "q"),
    status: enumParam(req, "status", UNIT_STATUSES),
    outletId: searchParam(req, "outletId"),
    variantId: searchParam(req, "variantId"),
    take: intParam(req, "take", 100, 1, 500),
  });
});
