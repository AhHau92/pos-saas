import { tenantRoute } from "@/lib/api/handler";
import { cancelTransfer } from "@/modules/transfers";

export const POST = tenantRoute<{ id: string }>(async ({ ctx, params }) => cancelTransfer(ctx, params.id));
