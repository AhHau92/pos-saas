import { readJson, searchParam, tenantRoute } from "@/lib/api/handler";
import { assertCan } from "@/lib/service-context";
import { createSupplier, listSuppliers } from "@/modules/purchasing";

export const GET = tenantRoute(async ({ req, ctx }) => {
  assertCan(ctx, "purchasing.view");
  return listSuppliers(ctx.db, { q: searchParam(req, "q"), includeInactive: searchParam(req, "inactive") === "1" });
});

export const POST = tenantRoute(async ({ req, ctx }) => createSupplier(ctx, await readJson(req)));
