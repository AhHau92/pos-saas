import { readJson, tenantRoute } from "@/lib/api/handler";
import { sendTestEmail } from "@/modules/settings";

export const POST = tenantRoute(async ({ req, ctx }) => sendTestEmail(ctx, await readJson(req)));
