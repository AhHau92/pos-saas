import { readJson, tenantRoute } from "@/lib/api/handler";
import { updatePaymentMethod } from "@/modules/sales";

export const PUT = tenantRoute<{ id: string }>(async ({ req, ctx, params }) =>
  updatePaymentMethod(ctx, params.id, await readJson(req)),
);
