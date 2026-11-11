import { readJson, tenantRoute } from "@/lib/api/handler";
import { receivePurchaseOrder } from "@/modules/purchasing";

/** Goods receipt (GRN) */
export const POST = tenantRoute<{ id: string }>(async ({ req, ctx, params }) =>
  receivePurchaseOrder(ctx, params.id, await readJson(req)),
);
