import type { TenantTx } from "@/lib/db/tenant";
import { yearInTimeZone } from "@/lib/time";

/**
 * Atomically allocates the next value of a named counter.
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING is concurrency-safe and works inside transactions.
 */
export async function nextSequenceValue(tx: TenantTx, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "DocumentSequence" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "DocumentSequence"."value" + 1
    RETURNING "value"`;
  const value = Number(rows[0]?.value);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`Could not allocate a document number for ${key}`);
  }
  return value;
}

export type DocumentPrefix = "PO" | "GRN" | "TR" | "RF" | "ADJ";

/** PO-2026-00001, GRN-2026-00001, TR-..., RF-..., ADJ-... (yearly sequence) */
export async function nextDocumentNumber(tx: TenantTx, prefix: DocumentPrefix, now: Date = new Date()): Promise<string> {
  const year = yearInTimeZone(now);
  const value = await nextSequenceValue(tx, `${prefix}:${year}`);
  return `${prefix}-${year}-${String(value).padStart(5, "0")}`;
}

/** Sales receipts are numbered per outlet: HQ-2026-000123 */
export async function nextSaleNumber(tx: TenantTx, outletCode: string, now: Date = new Date()): Promise<string> {
  const year = yearInTimeZone(now);
  const value = await nextSequenceValue(tx, `SALE:${outletCode}:${year}`);
  return `${outletCode}-${year}-${String(value).padStart(6, "0")}`;
}
