import { tenantRoute } from "@/lib/api/handler";
import { receiptLinkBase } from "@/lib/app-url";
import { getReceiptShare } from "@/modules/sales";

/** E-receipt link + WhatsApp click-to-chat link for the POS "sale completed" screen. */
export const GET = tenantRoute<{ id: string }>(async ({ ctx, params }) =>
  getReceiptShare(ctx, params.id, await receiptLinkBase(ctx.tenant.slug)),
);
