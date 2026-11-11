import { readJson, tenantRoute } from "@/lib/api/handler";
import { createTransfer } from "@/modules/transfers";

export const POST = tenantRoute(async ({ req, ctx }) => createTransfer(ctx, await readJson(req)));
