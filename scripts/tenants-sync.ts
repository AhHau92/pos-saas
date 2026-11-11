/**
 * Applies prisma/tenant/schema.prisma to EVERY tenant database (prisma db push).
 * Run after changing the tenant schema:
 *
 *   npm run tenants:sync
 *   npm run tenants:sync -- --accept-data-loss     (only if you know what you are doing)
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { getControlDb } from "@/lib/db/control";
import { pushTenantSchema } from "@/modules/tenant";
import { runCli } from "./lib/cli";

runCli(async () => {
  const { values } = parseArgs({ options: { "accept-data-loss": { type: "boolean", default: false } } });
  const tenants = await getControlDb().tenant.findMany({
    where: { status: { in: ["ACTIVE", "SUSPENDED"] } },
    orderBy: { createdAt: "asc" },
  });
  if (tenants.length === 0) {
    console.log("No tenants.");
    return;
  }
  let failed = 0;
  for (const tenant of tenants) {
    process.stdout.write(`→ ${tenant.slug} (${tenant.dbName}) … `);
    try {
      await pushTenantSchema(tenant.dbName, { acceptDataLoss: values["accept-data-loss"] });
      console.log("ok");
    } catch (error) {
      failed += 1;
      console.log("FAILED");
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failed > 0) throw new Error(`${failed} tenant(s) failed`);
  console.log(`✔ ${tenants.length} tenant database(s) in sync`);
});
