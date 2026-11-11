import { tenantRoute } from "@/lib/api/handler";
import { receiveTransfer } from "@/modules/transfers";

export const POST = tenantRoute<{ id: string }>(async ({ ctx, params }) => receiveTransfer(ctx, params.id));
