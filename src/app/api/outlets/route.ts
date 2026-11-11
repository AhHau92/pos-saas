import { readJson, tenantRoute } from "@/lib/api/handler";
import { createOutlet, listOutlets } from "@/modules/outlets";

export const GET = tenantRoute(async ({ ctx }) => listOutlets(ctx.db));

export const POST = tenantRoute(async ({ req, ctx }) => createOutlet(ctx, await readJson(req)));
