import { readJson, tenantRoute } from "@/lib/api/handler";
import { updateSupplier } from "@/modules/purchasing";

export const PUT = tenantRoute<{ id: string }>(async ({ req, ctx, params }) =>
  updateSupplier(ctx, params.id, await readJson(req)),
);
