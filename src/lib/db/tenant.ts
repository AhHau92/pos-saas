import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/tenant/client";

/** Prisma client connected to ONE tenant database. */
export type TenantDb = PrismaClient;
/** Interactive-transaction client. A TenantDb is also accepted wherever a TenantTx is expected. */
export type TenantTx = Prisma.TransactionClient;

export function tenantDatabaseUrl(dbName: string): string {
  const template = process.env.TENANT_DATABASE_URL_TEMPLATE;
  if (!template || !template.includes("{db}")) {
    throw new Error("TENANT_DATABASE_URL_TEMPLATE must be set and contain {db}");
  }
  return template.replace("{db}", encodeURIComponent(dbName));
}

/** Creates a new, uncached client. Callers must $disconnect() it. */
export function createTenantClient(dbName: string, poolMax?: number): TenantDb {
  const adapter = new PrismaPg({
    connectionString: tenantDatabaseUrl(dbName),
    max: poolMax ?? Number(process.env.TENANT_DB_POOL_MAX ?? 5),
  });
  return new PrismaClient({ adapter });
}

type CacheEntry = { client: TenantDb; lastUsed: number };

const globalForTenants = globalThis as unknown as { __posTenantDbs?: Map<string, CacheEntry> };
const clientCache: Map<string, CacheEntry> = (globalForTenants.__posTenantDbs ??= new Map());

/** Cached client per tenant database (LRU, see TENANT_CLIENT_CACHE_MAX). */
export function getTenantDb(dbName: string): TenantDb {
  const hit = clientCache.get(dbName);
  if (hit) {
    hit.lastUsed = Date.now();
    return hit.client;
  }
  const client = createTenantClient(dbName);
  clientCache.set(dbName, { client, lastUsed: Date.now() });
  evictLeastRecentlyUsed();
  return client;
}

function evictLeastRecentlyUsed(): void {
  const max = Math.max(1, Number(process.env.TENANT_CLIENT_CACHE_MAX ?? 50));
  if (clientCache.size <= max) return;
  const entries = [...clientCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [dbName, entry] of entries.slice(0, clientCache.size - max)) {
    clientCache.delete(dbName);
    void entry.client.$disconnect().catch(() => undefined);
  }
}

export async function disconnectAllTenantDbs(): Promise<void> {
  const entries = [...clientCache.values()];
  clientCache.clear();
  await Promise.all(entries.map((e) => e.client.$disconnect().catch(() => undefined)));
}
