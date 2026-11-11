import { getTenantDb } from "@/lib/db/tenant";
import { verifyPassword } from "@/lib/auth/password";
import { can } from "@/lib/auth/permissions";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { findUserForLogin, recordLogin } from "@/modules/users";
import { resolveTenantBySlug, type TenantInfo } from "./tenant.service";

const INVALID = "Invalid shop code, email or password";

/** Verifies shop code + email + password. Returns the tenant and user for the session cookie. */
export async function signInTenantUser(input: {
  shopCode: string;
  email: string;
  password: string;
}): Promise<{ tenant: TenantInfo; userId: string; defaultOutletId: string | null }> {
  if (!input.shopCode.trim() || !input.email.trim() || !input.password) {
    throw new ValidationError("Shop code, email and password are required");
  }
  const tenant = await resolveTenantBySlug(input.shopCode);
  if (!tenant) throw new UnauthorizedError(INVALID);
  if (tenant.status === "SUSPENDED") throw new UnauthorizedError("This shop account is suspended. Please contact support.");
  if (tenant.status !== "ACTIVE") throw new UnauthorizedError("This shop account is not ready yet.");

  const db = getTenantDb(tenant.dbName);
  const user = await findUserForLogin(db, input.email);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new UnauthorizedError(INVALID);
  if (!user.isActive) throw new UnauthorizedError("Your account is disabled. Please ask the shop owner.");

  if (!can(user.role, "outlets.switch")) {
    const outlet = user.defaultOutletId ? await db.outlet.findUnique({ where: { id: user.defaultOutletId } }) : null;
    if (!outlet || !outlet.isActive) {
      throw new UnauthorizedError("You are not assigned to an active outlet. Please ask the shop owner.");
    }
  }

  await recordLogin(db, user.id);
  return { tenant, userId: user.id, defaultOutletId: user.defaultOutletId };
}
