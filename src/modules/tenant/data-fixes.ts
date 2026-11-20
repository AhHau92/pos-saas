/**
 * Idempotent data fixes, run after every `prisma db push` of a tenant database
 * (npm run tenants:sync, and when a tenant is provisioned).
 *
 * v1 has no migration files (see docs/05-roadmap.md). When a new column needs values for rows that
 * existed before it, the fix goes here. Every statement must be safe to run again and again.
 * When the project switches to `prisma migrate`, these become part of the baseline migration.
 */
import { createTenantClient } from "@/lib/db/tenant";

export const TENANT_DATA_FIXES: { name: string; sql: string }[] = [
  {
    // Partial transfer receipt (2026-11): transfers received before receivedQuantity existed were always
    // received in full. New transfers always record what was received, lost or returned.
    name: "transfers received before partial receiving: received = sent",
    sql: `UPDATE "StockTransferItem" i
          SET "receivedQuantity" = i.quantity
          FROM "StockTransfer" t
          WHERE t.id = i."transferId" AND t.status = 'RECEIVED'
            AND i."receivedQuantity" = 0 AND i."lostQuantity" = 0 AND i."returnedQuantity" = 0`,
  },
];

export async function runTenantDataFixes(dbName: string): Promise<void> {
  const db = createTenantClient(dbName, 1);
  try {
    for (const fix of TENANT_DATA_FIXES) {
      await db.$executeRawUnsafe(fix.sql);
    }
  } finally {
    await db.$disconnect();
  }
}
