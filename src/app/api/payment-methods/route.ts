import { readJson, tenantRoute } from "@/lib/api/handler";
import { createPaymentMethod } from "@/modules/sales";

export const POST = tenantRoute(async ({ req, ctx }) => createPaymentMethod(ctx, await readJson(req)));
