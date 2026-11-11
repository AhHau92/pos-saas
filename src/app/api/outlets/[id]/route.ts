import { readJson, tenantRoute } from "@/lib/api/handler";
import { updateOutlet } from "@/modules/outlets";

export const PUT = tenantRoute<{ id: string }>(async ({ req, ctx, params }) =>
  updateOutlet(ctx, params.id, await readJson(req)),
);
