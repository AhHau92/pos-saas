/**
 * Verifies the inventory invariants of one tenant (docs/03-inventory-states.md §3).
 *   npm run inventory:check                (tenant "demo")
 *   npm run inventory:check -- --tenant mobilerelation
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { getTenantDb } from "@/lib/db/tenant";
import { resolveTenantBySlug } from "@/modules/tenant";
import { runCli } from "./lib/cli";

const CHECKS: { name: string; sql: string }[] = [
  {
    name: "StockLevel = sum of ledger movements",
    sql: `SELECT sl."outletId", sl."variantId", sl.quantity, COALESCE(SUM(m.quantity), 0)::int AS ledger
          FROM "StockLevel" sl
          LEFT JOIN "InventoryMovement" m ON m."outletId" = sl."outletId" AND m."variantId" = sl."variantId"
          GROUP BY sl."outletId", sl."variantId", sl.quantity
          HAVING sl.quantity <> COALESCE(SUM(m.quantity), 0)`,
  },
  {
    name: "IMEI products: StockLevel = IN_STOCK units",
    sql: `SELECT sl."outletId", sl."variantId", sl.quantity, COUNT(u.id)::int AS units
          FROM "StockLevel" sl
          JOIN "ProductVariant" v ON v.id = sl."variantId"
          JOIN "Product" p ON p.id = v."productId" AND p.type = 'SERIALIZED'
          LEFT JOIN "StockUnit" u ON u."variantId" = sl."variantId" AND u."outletId" = sl."outletId" AND u.status = 'IN_STOCK'
          GROUP BY sl."outletId", sl."variantId", sl.quantity
          HAVING sl.quantity <> COUNT(u.id)`,
  },
  {
    name: "IN_STOCK units always have a StockLevel row",
    sql: `SELECT u."outletId", u."variantId", COUNT(*)::int AS units
          FROM "StockUnit" u
          LEFT JOIN "StockLevel" sl ON sl."outletId" = u."outletId" AND sl."variantId" = u."variantId"
          WHERE u.status = 'IN_STOCK' AND sl.id IS NULL
          GROUP BY u."outletId", u."variantId"`,
  },
  {
    name: "No negative stock",
    sql: `SELECT "outletId", "variantId", quantity FROM "StockLevel" WHERE quantity < 0`,
  },
  {
    name: "Sales: items add up to the sale total",
    sql: `SELECT s.number, s."totalCents", SUM(i."totalCents")::int AS items
          FROM "Sale" s JOIN "SaleItem" i ON i."saleId" = s.id
          GROUP BY s.id, s.number, s."totalCents"
          HAVING s."totalCents" <> SUM(i."totalCents")`,
  },
  {
    name: "Sales: payments add up to the sale total",
    sql: `SELECT s.number, s."totalCents", COALESCE(SUM(p."amountCents"), 0)::int AS paid
          FROM "Sale" s LEFT JOIN "Payment" p ON p."saleId" = s.id
          GROUP BY s.id, s.number, s."totalCents"
          HAVING s."totalCents" <> COALESCE(SUM(p."amountCents"), 0)`,
  },
];

runCli(async () => {
  const { values } = parseArgs({ options: { tenant: { type: "string", default: "demo" } } });
  const slug = values.tenant ?? "demo";
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new Error(`Tenant "${slug}" not found`);
  const db = getTenantDb(tenant.dbName);
  let problems = 0;
  for (const check of CHECKS) {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(check.sql);
    if (rows.length === 0) {
      console.log(`✔ ${check.name}`);
    } else {
      problems += rows.length;
      console.log(`✖ ${check.name}: ${rows.length} problem(s)`);
      console.table(rows.slice(0, 20));
    }
  }
  if (problems > 0) throw new Error(`${problems} inventory problem(s) found`);
  console.log("\nAll inventory checks passed.");
});
