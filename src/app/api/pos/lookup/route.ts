import { searchParam, tenantRoute } from "@/lib/api/handler";
import { assertCan } from "@/lib/service-context";
import { posLookup } from "@/modules/sales";

/** POS scanner box: IMEI / serial / SKU / barcode / name at the current outlet. */
export const GET = tenantRoute(async ({ req, ctx }) => {
  assertCan(ctx, "pos.sell");
  return posLookup(ctx.db, ctx.outletId, searchParam(req, "q") ?? "");
});
