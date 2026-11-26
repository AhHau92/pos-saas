import { readJson, tenantRoute } from "@/lib/api/handler";
import { createCompany, listCompanies } from "@/modules/outlets";

export const GET = tenantRoute(async ({ ctx }) => listCompanies(ctx.db, { includeInactive: true }));

export const POST = tenantRoute(async ({ req, ctx }) => createCompany(ctx, await readJson(req)));
