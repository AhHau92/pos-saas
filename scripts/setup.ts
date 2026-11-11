/**
 * First-time setup:  npm run setup            (with demo tenant)
 *                    npm run setup -- --no-demo
 *
 * 1. Creates / updates the Control DB tables (prisma db push)
 * 2. Seeds the subscription plans
 * 3. Creates (or resets the password of) the platform admin from .env
 * 4. Provisions a "demo" tenant with sample data
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { getTenantDb } from "@/lib/db/tenant";
import {
  ensurePlatformAdmin,
  provisionTenant,
  pushControlSchema,
  resolveTenantBySlug,
  seedDefaultPlans,
} from "@/modules/tenant";
import { requireEnv, runCli } from "./lib/cli";
import { seedDemoData } from "./lib/demo-data";

runCli(async () => {
  const { values } = parseArgs({ options: { "no-demo": { type: "boolean", default: false } } });
  requireEnv("CONTROL_DATABASE_URL");
  requireEnv("TENANT_DATABASE_URL_TEMPLATE");
  requireEnv("SESSION_SECRET");

  console.log("1/4  Control DB schema …");
  await pushControlSchema();

  console.log("2/4  Plans …");
  await seedDefaultPlans();

  console.log("3/4  Platform admin …");
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD || "ChangeMe123!";
  await ensurePlatformAdmin({ email: adminEmail, password: adminPassword });

  if (!values["no-demo"]) {
    console.log("4/4  Demo tenant …");
    let demo = await resolveTenantBySlug("demo");
    if (!demo) {
      await provisionTenant({
        slug: "demo",
        name: "Demo Phone Shop",
        planCode: "GROWTH",
        ownerName: "Demo Owner",
        ownerEmail: "owner@example.com",
        ownerPassword: "demo1234",
        outletName: "HQ",
      });
      demo = await resolveTenantBySlug("demo");
    }
    if (demo && demo.status === "ACTIVE") {
      await seedDemoData(getTenantDb(demo.dbName));
    } else {
      console.log("   demo tenant is not active — skipped seeding");
    }
  }

  console.log(`
✔ Setup complete

  Platform admin   http://localhost:3000/platform
                   ${adminEmail} / ${adminPassword}
${
  values["no-demo"]
    ? ""
    : `
  Demo shop        http://localhost:3000/login
                   Shop code: demo
                   owner@example.com   / demo1234  (Owner)
                   manager@example.com / demo1234  (Manager)
                   cashier@example.com / demo1234  (Cashier, Toa Payoh)
`
}
  Create your real shop:  npm run tenant:create -- --slug mobilerelation --name "Mobile Relation" \\
                            --owner-name "Your Name" --owner-email you@example.com --owner-password "********"
`);
});
