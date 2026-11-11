import { tenantRoute } from "@/lib/api/handler";
import { dispatchTransfer } from "@/modules/transfers";

export const POST = tenantRoute<{ id: string }>(async ({ ctx, params }) => dispatchTransfer(ctx, params.id));
