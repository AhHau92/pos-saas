import { readJson, tenantRoute } from "@/lib/api/handler";
import { createUser } from "@/modules/users";

export const POST = tenantRoute(async ({ req, ctx }) => createUser(ctx, await readJson(req)));
