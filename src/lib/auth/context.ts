import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantDb } from "@/lib/db/tenant";
import type { ServiceContext } from "@/lib/service-context";
import { getPlatformAdminById, resolveTenantBySlug, type PlatformAdminDTO, type TenantInfo } from "@/modules/tenant";
import { can, type Role } from "./permissions";
import {
  OUTLET_COOKIE,
  PLATFORM_SESSION_COOKIE,
  TENANT_SESSION_COOKIE,
  verifyToken,
  type PlatformSessionPayload,
  type TenantSessionPayload,
} from "./session";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  defaultOutletId: string | null;
};

export type OutletOption = { id: string; code: string; name: string };

/** Everything a page or API route needs about the signed-in tenant user. */
export type TenantContext = ServiceContext & {
  tenant: TenantInfo;
  user: CurrentUser;
  outlet: OutletOption;
  /** Outlets this user may switch to */
  outlets: OutletOption[];
};

/**
 * Resolves the session cookie → tenant (Control DB) → tenant database → user → current outlet.
 * Wrapped in React cache() so a layout and page in the same request share one lookup.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const store = await cookies();
  const payload = verifyToken<TenantSessionPayload>(store.get(TENANT_SESSION_COOKIE)?.value);
  if (!payload || payload.k !== "t") return null;

  const tenant = await resolveTenantBySlug(payload.t);
  if (!tenant || tenant.status !== "ACTIVE") return null;

  const db = getTenantDb(tenant.dbName);
  const user = await db.user.findUnique({ where: { id: payload.u } });
  if (!user || !user.isActive) return null;

  const activeOutlets = await db.outlet.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const outlets: OutletOption[] = (
    can(user.role, "outlets.switch") ? activeOutlets : activeOutlets.filter((o) => o.id === user.defaultOutletId)
  ).map((o) => ({ id: o.id, code: o.code, name: o.name }));
  if (outlets.length === 0) return null;

  const requested = store.get(OUTLET_COOKIE)?.value;
  const outlet =
    outlets.find((o) => o.id === requested) ?? outlets.find((o) => o.id === user.defaultOutletId) ?? outlets[0];

  return {
    db,
    tenant,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, defaultOutletId: user.defaultOutletId },
    userId: user.id,
    role: user.role,
    outletId: outlet.id,
    outlet,
    outlets,
    limits: tenant.plan ? { maxOutlets: tenant.plan.maxOutlets, maxUsers: tenant.plan.maxUsers } : undefined,
  };
});

/** For pages: redirects to /login when not signed in. */
export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export const getPlatformAdmin = cache(async (): Promise<PlatformAdminDTO | null> => {
  const store = await cookies();
  const payload = verifyToken<PlatformSessionPayload>(store.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!payload || payload.k !== "p") return null;
  return getPlatformAdminById(payload.a);
});

export async function requirePlatformAdmin(): Promise<PlatformAdminDTO> {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform/login");
  return admin;
}
