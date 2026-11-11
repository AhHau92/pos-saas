import { readJson, tenantRoute } from "@/lib/api/handler";
import { refundSale } from "@/modules/sales";

export const POST = tenantRoute<{ id: string }>(async ({ req, ctx, params }) =>
  refundSale(ctx, params.id, await readJson(req)),
);
