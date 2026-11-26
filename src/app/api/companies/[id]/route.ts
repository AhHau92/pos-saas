import { readJson, tenantRoute } from "@/lib/api/handler";
import { updateCompany } from "@/modules/outlets";

export const PUT = tenantRoute<{ id: string }>(async ({ req, ctx, params }) => updateCompany(ctx, params.id, await readJson(req)));
