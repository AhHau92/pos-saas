import { readJson, tenantRoute } from "@/lib/api/handler";
import { createAdjustment } from "@/modules/inventory";

export const POST = tenantRoute(async ({ req, ctx }) => createAdjustment(ctx, await readJson(req)));
