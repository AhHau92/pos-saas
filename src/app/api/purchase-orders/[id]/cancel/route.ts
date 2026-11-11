import { tenantRoute } from "@/lib/api/handler";
import { cancelPurchaseOrder } from "@/modules/purchasing";

export const POST = tenantRoute<{ id: string }>(async ({ ctx, params }) => cancelPurchaseOrder(ctx, params.id));
