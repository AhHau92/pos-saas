import { readJson, tenantRoute } from "@/lib/api/handler";
import { receiptLinkBase } from "@/lib/app-url";
import { emailReceipt } from "@/modules/sales";

/** Body: { email?: string } — empty = the address given at checkout / the customer's email. */
export const POST = tenantRoute<{ id: string }>(async ({ req, ctx, params }) =>
  emailReceipt(ctx, params.id, await readJson(req), await receiptLinkBase(ctx.tenant.slug)),
);
