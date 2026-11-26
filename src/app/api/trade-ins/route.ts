import { readJson, searchParam, tenantRoute } from "@/lib/api/handler";
import { assertCan } from "@/lib/service-context";
import { createBuyBack, listTradeIns } from "@/modules/sales";

export const GET = tenantRoute(async ({ req, ctx }) => {
  assertCan(ctx, "tradeins.view");
  return listTradeIns(ctx.db, { q: searchParam(req, "q"), take: 100 });
});

/** Buy-back (customer is paid). Trade-ins towards a sale go through POST /api/sales. */
export const POST = tenantRoute(async ({ req, ctx }) => createBuyBack(ctx, await readJson(req)));
