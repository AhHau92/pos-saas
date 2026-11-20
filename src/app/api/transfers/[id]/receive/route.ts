import { readJson, tenantRoute } from "@/lib/api/handler";
import { receiveTransfer } from "@/modules/transfers";

/** Body: { all: true } or { lines: [{ itemId, quantity }] } — see receiveTransfer. */
export const POST = tenantRoute<{ id: string }>(async ({ req, ctx, params }) => receiveTransfer(ctx, params.id, await readJson(req)));
