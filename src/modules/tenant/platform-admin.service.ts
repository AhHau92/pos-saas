import { getControlDb } from "@/lib/db/control";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { UnauthorizedError } from "@/lib/errors";

export type PlatformAdminDTO = { id: string; email: string; name: string };

export async function authenticatePlatformAdmin(email: string, password: string): Promise<PlatformAdminDTO> {
  const admin = await getControlDb().platformAdmin.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  return { id: admin.id, email: admin.email, name: admin.name };
}

export async function getPlatformAdminById(id: string): Promise<PlatformAdminDTO | null> {
  const admin = await getControlDb().platformAdmin.findUnique({ where: { id } });
  return admin ? { id: admin.id, email: admin.email, name: admin.name } : null;
}

/** Creates the admin, or resets its password if it already exists (used by `npm run setup`). */
export async function ensurePlatformAdmin(input: { email: string; password: string; name?: string }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  await getControlDb().platformAdmin.upsert({
    where: { email },
    create: { email, name: input.name ?? "Platform Admin", passwordHash },
    update: { passwordHash },
  });
}
