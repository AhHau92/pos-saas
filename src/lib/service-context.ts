import type { TenantDb } from "@/lib/db/tenant";
import { ForbiddenError } from "@/lib/errors";
import { can, type Permission, type Role } from "@/lib/auth/permissions";

/**
 * What every tenant service function receives: who is acting, where, and the tenant database.
 * Built from the session by getTenantContext(); scripts can build one by hand.
 */
export type ServiceContext = {
  db: TenantDb;
  userId: string;
  role: Role;
  /** Current outlet (cashiers are always at their default outlet) */
  outletId: string;
  /** Plan limits from the Control DB; undefined = unlimited (scripts) */
  limits?: { maxOutlets: number; maxUsers: number };
};

export function assertCan(ctx: Pick<ServiceContext, "role">, permission: Permission): void {
  if (!can(ctx.role, permission)) throw new ForbiddenError();
}
