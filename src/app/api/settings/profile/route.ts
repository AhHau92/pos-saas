import { readJson, tenantRoute } from "@/lib/api/handler";
import { updateBusinessProfile } from "@/modules/settings";

export const PUT = tenantRoute(async ({ req, ctx }) => updateBusinessProfile(ctx, await readJson(req)));
