import { readJson, tenantRoute } from "@/lib/api/handler";
import { checkout } from "@/modules/sales";

/** POS checkout at the current outlet */
export const POST = tenantRoute(async ({ req, ctx }) => checkout(ctx, await readJson(req)));
