import { readJson, searchParam, tenantRoute } from "@/lib/api/handler";
import { assertCan } from "@/lib/service-context";
import { createCustomer, searchCustomers } from "@/modules/sales";

export const GET = tenantRoute(async ({ req, ctx }) => {
  assertCan(ctx, "customers.manage");
  return searchCustomers(ctx.db, searchParam(req, "q") ?? "");
});

export const POST = tenantRoute(async ({ req, ctx }) => createCustomer(ctx, await readJson(req)));
