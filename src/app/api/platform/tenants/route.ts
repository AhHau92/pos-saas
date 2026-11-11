import { platformRoute, readJson } from "@/lib/api/handler";
import { listTenants, provisionTenant } from "@/modules/tenant";

export const GET = platformRoute(async () => listTenants());

/** Provisions a new tenant (creates its database). Can take ~10–30 seconds. */
export const POST = platformRoute(async ({ req }) => provisionTenant(await readJson(req)));
