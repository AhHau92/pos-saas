/**
 * Adds demo data to an existing tenant that has no products yet.
 *   npm run seed:demo                 (tenant "demo")
 *   npm run seed:demo -- --tenant xyz
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { getTenantDb } from "@/lib/db/tenant";
import { resolveTenantBySlug } from "@/modules/tenant";
import { runCli } from "./lib/cli";
import { seedDemoData } from "./lib/demo-data";

runCli(async () => {
  const { values } = parseArgs({ options: { tenant: { type: "string", default: "demo" } } });
  const slug = values.tenant ?? "demo";
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant || tenant.status !== "ACTIVE") throw new Error(`Tenant "${slug}" not found or not active`);
  console.log(`Seeding demo data into ${tenant.slug} (${tenant.dbName}) …`);
  await seedDemoData(getTenantDb(tenant.dbName));
  console.log("✔ Done");
});
