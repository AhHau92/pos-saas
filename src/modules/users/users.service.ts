import { z } from "zod";
import type { TenantDb, TenantTx } from "@/lib/db/tenant";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import type { Role } from "@/lib/auth/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, isPrismaError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { idSchema, parseInput, requiredText } from "@/lib/validation";

export type UserDTO = {
  id: string;
  email: string;
  name: string;
  role: Role;
  defaultOutletId: string | null;
  defaultOutletName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

const ROLES = ["OWNER", "MANAGER", "CASHIER"] as const;

const emailSchema = z.string().trim().toLowerCase().email("Invalid email").max(120);
const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`).max(200);

const createSchema = z.object({
  name: requiredText(80),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(ROLES),
  defaultOutletId: idSchema.optional().nullable(),
});

const updateSchema = z.object({
  name: requiredText(80).optional(),
  role: z.enum(ROLES).optional(),
  defaultOutletId: idSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export async function listUsers(db: TenantTx): Promise<UserDTO[]> {
  const rows = await db.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { defaultOutlet: true },
  });
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    defaultOutletId: u.defaultOutletId,
    defaultOutletName: u.defaultOutlet ? `${u.defaultOutlet.code} · ${u.defaultOutlet.name}` : null,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }));
}

async function assertUserLimit(ctx: ServiceContext): Promise<void> {
  if (!ctx.limits) return;
  const active = await ctx.db.user.count({ where: { isActive: true } });
  if (active >= ctx.limits.maxUsers) {
    throw new ForbiddenError(`Your plan allows ${ctx.limits.maxUsers} active user(s). Please upgrade your plan.`);
  }
}

async function assertOutletUsable(db: TenantTx, outletId: string | null | undefined, role: Role): Promise<void> {
  if (!outletId) {
    if (role === "CASHIER") throw new ValidationError("A cashier must be assigned to an outlet");
    return;
  }
  const outlet = await db.outlet.findUnique({ where: { id: outletId } });
  if (!outlet || !outlet.isActive) throw new ValidationError("Outlet not found or inactive");
}

export async function createUser(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  assertCan(ctx, "users.manage");
  const data = parseInput(createSchema, input);
  await assertOutletUsable(ctx.db, data.defaultOutletId, data.role);
  await assertUserLimit(ctx);
  try {
    const user = await ctx.db.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        role: data.role,
        defaultOutletId: data.defaultOutletId ?? null,
      },
    });
    return { id: user.id };
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new ConflictError(`${data.email} is already used by another user`);
    throw error;
  }
}

export async function updateUser(ctx: ServiceContext, id: string, input: unknown): Promise<{ id: string }> {
  assertCan(ctx, "users.manage");
  const data = parseInput(updateSchema, input);
  const user = await ctx.db.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("User not found");

  if (id === ctx.userId) {
    if (data.isActive === false) throw new ValidationError("You cannot deactivate your own account");
    if (data.role && data.role !== user.role) throw new ValidationError("You cannot change your own role");
  }

  const nextRole = data.role ?? user.role;
  const nextActive = data.isActive ?? user.isActive;
  if (user.role === "OWNER" && user.isActive && (nextRole !== "OWNER" || !nextActive)) {
    const otherOwners = await ctx.db.user.count({ where: { role: "OWNER", isActive: true, id: { not: id } } });
    if (otherOwners === 0) throw new ValidationError("There must be at least one active owner");
  }
  if (!user.isActive && nextActive) await assertUserLimit(ctx);

  const nextOutlet = data.defaultOutletId === undefined ? user.defaultOutletId : data.defaultOutletId;
  await assertOutletUsable(ctx.db, nextOutlet, nextRole);

  await ctx.db.user.update({
    where: { id },
    data: {
      name: data.name,
      role: data.role,
      isActive: data.isActive,
      defaultOutletId: data.defaultOutletId === undefined ? undefined : data.defaultOutletId,
      passwordHash: data.password ? await hashPassword(data.password) : undefined,
    },
  });
  return { id };
}

export type LoginUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  isActive: boolean;
  defaultOutletId: string | null;
};

export async function findUserForLogin(db: TenantDb, email: string): Promise<LoginUser | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    defaultOutletId: user.defaultOutletId,
  };
}

export async function recordLogin(db: TenantDb, userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

/** Creates (or keeps) the owner account of a newly provisioned tenant. */
export async function bootstrapOwner(
  db: TenantDb,
  input: { name: string; email: string; password: string; outletId: string },
): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: "OWNER",
      defaultOutletId: input.outletId,
    },
    update: {},
  });
  return { id: user.id };
}
