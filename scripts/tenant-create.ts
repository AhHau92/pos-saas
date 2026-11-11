/**
 * Provision a new tenant (shop) from the command line:
 *
 *   npm run tenant:create -- --slug mobilerelation --name "Mobile Relation" \
 *     --owner-name "Owner Name" --owner-email owner@example.com --owner-password "secret123" \
 *     [--plan GROWTH] [--outlet "HQ"] [--currency SGD] [--tax 9] [--tax-exclusive]
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { provisionTenant } from "@/modules/tenant";
import { requireEnv, runCli } from "./lib/cli";
import { assertDatabaseReachable } from "./lib/env";

runCli(async () => {
  const { values } = parseArgs({
    options: {
      slug: { type: "string" },
      name: { type: "string" },
      plan: { type: "string", default: "GROWTH" },
      "owner-name": { type: "string" },
      "owner-email": { type: "string" },
      "owner-password": { type: "string" },
      outlet: { type: "string", default: "HQ" },
      currency: { type: "string", default: "SGD" },
      tax: { type: "string", default: "9" },
      "tax-exclusive": { type: "boolean", default: false },
    },
  });
  const missing = ["slug", "name", "owner-name", "owner-email", "owner-password"].filter(
    (key) => !values[key as keyof typeof values],
  );
  if (missing.length > 0) throw new Error(`Missing --${missing.join(", --")}`);

  await assertDatabaseReachable(requireEnv("CONTROL_DATABASE_URL"));
  console.log(`Provisioning tenant "${values.slug}" … (creates a database, takes a few seconds)`);
  const result = await provisionTenant({
    slug: values.slug,
    name: values.name,
    planCode: values.plan,
    ownerName: values["owner-name"],
    ownerEmail: values["owner-email"],
    ownerPassword: values["owner-password"],
    outletName: values.outlet,
    currency: values.currency,
    taxRateBps: Math.round(Number(values.tax) * 100),
    taxInclusive: !values["tax-exclusive"],
  });
  console.log(`✔ Tenant ready
  Shop code : ${result.slug}
  Database  : ${result.dbName}
  Sign in   : http://localhost:3000/login  (${values["owner-email"]})`);
});
