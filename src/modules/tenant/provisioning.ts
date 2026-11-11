import { execFile } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { getControlDb } from "@/lib/db/control";
import { createTenantClient, tenantDatabaseUrl } from "@/lib/db/tenant";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { ConflictError, ValidationError } from "@/lib/errors";
import { addDays } from "@/lib/time";
import { parseInput, requiredText } from "@/lib/validation";
import { initBusinessProfile } from "@/modules/settings";
import { bootstrapOutlet } from "@/modules/outlets";
import { bootstrapOwner } from "@/modules/users";
import { seedDefaultPaymentMethods } from "@/modules/sales";
import { invalidateTenantCache, normalizeSlug } from "./tenant.service";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;
const RESERVED_SLUGS = new Set(["admin", "platform", "api", "www", "control", "postgres", "template0", "template1"]);

export function databaseNameForSlug(slug: string): string {
  return `pos_t_${normalizeSlug(slug).replace(/-/g, "_")}`;
}

const provisionSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, "Shop code: 3–32 lowercase letters, numbers or dashes (e.g. mobilerelation)"),
  name: requiredText(120),
  planCode: z.string().trim().toUpperCase().min(1),
  ownerName: requiredText(80),
  ownerEmail: z.string().trim().toLowerCase().email("Invalid owner email"),
  ownerPassword: z.string().min(PASSWORD_MIN_LENGTH, `Owner password: at least ${PASSWORD_MIN_LENGTH} characters`),
  outletName: z.string().trim().max(80).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  taxRateBps: z.number().int().min(0).max(5000).optional(),
  taxInclusive: z.boolean().optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
});

export type ProvisionTenantInput = z.input<typeof provisionSchema>;

/**
 * Creates a tenant end-to-end: Control DB record → database → schema → seed data → subscription.
 * See docs/04-business-flows.md §6.
 */
export async function provisionTenant(input: unknown): Promise<{ tenantId: string; slug: string; dbName: string }> {
  const data = parseInput(provisionSchema, input);
  if (RESERVED_SLUGS.has(data.slug)) throw new ValidationError(`"${data.slug}" is reserved`);

  const control = getControlDb();
  const plan = await control.plan.findUnique({ where: { code: data.planCode } });
  if (!plan || !plan.isActive) throw new ValidationError(`Unknown plan ${data.planCode}`);
  if (await control.tenant.findUnique({ where: { slug: data.slug } })) {
    throw new ConflictError(`Shop code "${data.slug}" is already taken`);
  }

  const dbName = databaseNameForSlug(data.slug);
  const tenant = await control.tenant.create({
    data: { slug: data.slug, name: data.name, dbName, ownerEmail: data.ownerEmail, status: "PROVISIONING" },
  });

  try {
    await createDatabaseIfMissing(dbName);
    await pushTenantSchema(dbName);

    const db = createTenantClient(dbName, 2);
    try {
      await initBusinessProfile(db, {
        name: data.name,
        currency: data.currency,
        taxRateBps: data.taxRateBps,
        taxInclusive: data.taxInclusive,
      });
      const outlet = await bootstrapOutlet(db, { code: "HQ", name: data.outletName || "Main Store" });
      await bootstrapOwner(db, {
        name: data.ownerName,
        email: data.ownerEmail,
        password: data.ownerPassword,
        outletId: outlet.id,
      });
      await seedDefaultPaymentMethods(db);
    } finally {
      await db.$disconnect();
    }

    await control.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: "TRIALING",
        currentPeriodEnd: addDays(new Date(), data.trialDays ?? 14),
      },
    });
    await control.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE", provisionError: null } });
    invalidateTenantCache(data.slug);
    return { tenantId: tenant.id, slug: data.slug, dbName };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await control.tenant.update({
      where: { id: tenant.id },
      data: { status: "FAILED", provisionError: message.slice(0, 4000) },
    });
    invalidateTenantCache(data.slug);
    throw error;
  }
}

export async function createDatabaseIfMissing(dbName: string): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`Invalid database name: ${dbName}`);
  const control = getControlDb();
  const rows = await control.$queryRawUnsafe<{ exists: number }[]>(
    `SELECT 1 AS "exists" FROM pg_database WHERE datname = $1`,
    dbName,
  );
  if (rows.length === 0) {
    // CREATE DATABASE cannot take bind parameters; the name is validated above.
    await control.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  }
}

/** Runs the local Prisma CLI (node_modules/.bin/prisma). */
export function runPrismaCli(args: string[], extraEnv: Record<string, string> = {}): Promise<string> {
  const bin = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        cwd: process.cwd(),
        env: { ...process.env, ...extraEnv },
        timeout: 180_000,
        maxBuffer: 10 * 1024 * 1024,
        shell: process.platform === "win32",
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`prisma ${args.join(" ")} failed: ${(stderr || stdout || error.message).trim()}`));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/** Creates / updates all tables of one tenant database from prisma/tenant/schema.prisma. */
export async function pushTenantSchema(dbName: string, options: { acceptDataLoss?: boolean } = {}): Promise<void> {
  const args = ["db", "push", "--config", "prisma.tenant.config.ts"];
  if (options.acceptDataLoss) args.push("--accept-data-loss");
  await runPrismaCli(args, { TENANT_DATABASE_URL: tenantDatabaseUrl(dbName) });
}

export async function pushControlSchema(options: { acceptDataLoss?: boolean } = {}): Promise<void> {
  const args = ["db", "push", "--config", "prisma.control.config.ts"];
  if (options.acceptDataLoss) args.push("--accept-data-loss");
  await runPrismaCli(args);
}
