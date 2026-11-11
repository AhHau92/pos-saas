import { getControlDb } from "@/lib/db/control";
import { NotFoundError, ValidationError } from "@/lib/errors";

export type TenantStatusValue = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "FAILED";

export type PlanLimits = { code: string; name: string; maxOutlets: number; maxUsers: number };

export type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  status: TenantStatusValue;
  dbName: string;
  plan: PlanLimits | null;
};

type TenantWithSubscriptions = {
  id: string;
  slug: string;
  name: string;
  status: TenantStatusValue;
  dbName: string;
  subscriptions: { plan: { code: string; name: string; maxOutlets: number; maxUsers: number } }[];
};

function toTenantInfo(tenant: TenantWithSubscriptions): TenantInfo {
  const plan = tenant.subscriptions[0]?.plan;
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    dbName: tenant.dbName,
    plan: plan ? { code: plan.code, name: plan.name, maxOutlets: plan.maxOutlets, maxUsers: plan.maxUsers } : null,
  };
}

// Small in-memory cache: every request resolves the tenant from the session cookie.
const CACHE_TTL_MS = 30_000;
const globalForTenantCache = globalThis as unknown as {
  __posTenantInfoCache?: Map<string, { at: number; info: TenantInfo | null }>;
};
const tenantInfoCache: Map<string, { at: number; info: TenantInfo | null }> = (globalForTenantCache.__posTenantInfoCache ??=
  new Map());

export function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export async function resolveTenantBySlug(slug: string): Promise<TenantInfo | null> {
  const key = normalizeSlug(slug);
  const hit = tenantInfoCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.info;

  const tenant = await getControlDb().tenant.findUnique({
    where: { slug: key },
    include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } } },
  });
  const info = tenant ? toTenantInfo(tenant) : null;
  tenantInfoCache.set(key, { at: Date.now(), info });
  return info;
}

export function invalidateTenantCache(slug?: string): void {
  if (slug) tenantInfoCache.delete(normalizeSlug(slug));
  else tenantInfoCache.clear();
}

export type TenantListItem = {
  id: string;
  slug: string;
  name: string;
  status: TenantStatusValue;
  dbName: string;
  ownerEmail: string;
  planName: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  provisionError: string | null;
  createdAt: string;
};

export async function listTenants(): Promise<TenantListItem[]> {
  const rows = await getControlDb().tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } } },
  });
  return rows.map((t) => {
    const sub = t.subscriptions[0];
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      dbName: t.dbName,
      ownerEmail: t.ownerEmail,
      planName: sub ? sub.plan.name : null,
      subscriptionStatus: sub ? sub.status : null,
      currentPeriodEnd: sub ? sub.currentPeriodEnd.toISOString() : null,
      provisionError: t.provisionError,
      createdAt: t.createdAt.toISOString(),
    };
  });
}

export async function setTenantStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED"): Promise<void> {
  const db = getControlDb();
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError("Tenant not found");
  if (tenant.status === "PROVISIONING" || tenant.status === "FAILED") {
    throw new ValidationError("Tenant is not provisioned yet");
  }
  await db.tenant.update({ where: { id: tenantId }, data: { status } });
  invalidateTenantCache(tenant.slug);
}

export type PlanDTO = {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  maxOutlets: number;
  maxUsers: number;
};

export async function listPlans(): Promise<PlanDTO[]> {
  const rows = await getControlDb().plan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } });
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    priceCents: p.priceCents,
    currency: p.currency,
    maxOutlets: p.maxOutlets,
    maxUsers: p.maxUsers,
  }));
}

export const DEFAULT_PLANS = [
  { code: "STARTER", name: "Starter", priceCents: 4900, maxOutlets: 1, maxUsers: 3 },
  { code: "GROWTH", name: "Growth", priceCents: 14900, maxOutlets: 5, maxUsers: 20 },
  { code: "ENTERPRISE", name: "Enterprise", priceCents: 39900, maxOutlets: 50, maxUsers: 300 },
];

export async function seedDefaultPlans(): Promise<void> {
  const db = getControlDb();
  for (const plan of DEFAULT_PLANS) {
    await db.plan.upsert({
      where: { code: plan.code },
      create: { ...plan, currency: "SGD" },
      update: { name: plan.name, maxOutlets: plan.maxOutlets, maxUsers: plan.maxUsers },
    });
  }
}
