// Prisma CLI config for tenant databases (one per customer).
// TENANT_DATABASE_URL is set per tenant by scripts/tenants-sync.ts and by provisioning;
// it is intentionally NOT defined in .env.
// Usage: TENANT_DATABASE_URL=postgresql://.../pos_t_demo npx prisma db push --config prisma.tenant.config.ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/tenant/schema.prisma",
  datasource: {
    url: process.env.TENANT_DATABASE_URL ?? "",
  },
});
