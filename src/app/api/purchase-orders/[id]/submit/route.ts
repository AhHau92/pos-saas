import { tenantRoute } from "@/lib/api/handler";
import { submitPurchaseOrder } from "@/modules/purchasing";

export const POST = tenantRoute<{ id: string }>(async ({ ctx, params }) => submitPurchaseOrder(ctx, params.id));
