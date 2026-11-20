import { tenantRoute } from "@/lib/api/handler";
import { recordReceiptPrint } from "@/modules/sales";

export const POST = tenantRoute<{ id: string }>(async ({ ctx, params }) => recordReceiptPrint(ctx, params.id));
