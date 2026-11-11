import { readJson, tenantRoute } from "@/lib/api/handler";
import { updatePurchaseOrder } from "@/modules/purchasing";

/** Edit a DRAFT purchase order */
export const PUT = tenantRoute<{ id: string }>(async ({ req, ctx, params }) =>
  updatePurchaseOrder(ctx, params.id, await readJson(req)),
);
