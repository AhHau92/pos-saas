import { readJson, tenantRoute } from "@/lib/api/handler";
import { createPurchaseOrder } from "@/modules/purchasing";

export const POST = tenantRoute(async ({ req, ctx }) => createPurchaseOrder(ctx, await readJson(req)));
