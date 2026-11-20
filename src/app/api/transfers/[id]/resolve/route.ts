import { readJson, tenantRoute } from "@/lib/api/handler";
import { resolveTransfer } from "@/modules/transfers";

/** Body: { lines: [{ itemId, quantity, action: "LOST" | "RETURN" }], note? } */
export const POST = tenantRoute<{ id: string }>(async ({ req, ctx, params }) => resolveTransfer(ctx, params.id, await readJson(req)));
