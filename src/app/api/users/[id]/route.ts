import { readJson, tenantRoute } from "@/lib/api/handler";
import { updateUser } from "@/modules/users";

export const PUT = tenantRoute<{ id: string }>(async ({ req, ctx, params }) =>
  updateUser(ctx, params.id, await readJson(req)),
);
