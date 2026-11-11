import { z } from "zod";
import type { TenantDb, TenantTx } from "@/lib/db/tenant";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, isPrismaError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { emptyToNull, optionalText, parseInput, requiredText } from "@/lib/validation";

export type OutletDTO = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
};

type OutletRow = OutletDTO;

function toDto(row: OutletRow): OutletDTO {
  return { id: row.id, code: row.code, name: row.name, address: row.address, phone: row.phone, isActive: row.isActive };
}

export async function listOutlets(db: TenantTx, options: { includeInactive?: boolean } = {}): Promise<OutletDTO[]> {
  const rows = await db.outlet.findMany({
    where: options.includeInactive ? undefined : { isActive: true },
    orderBy: { code: "asc" },
  });
  return rows.map(toDto);
}

export async function getOutletOrThrow(db: TenantTx, id: string): Promise<OutletDTO> {
  const row = await db.outlet.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Outlet not found");
  return toDto(row);
}

const outletCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,10}$/, "Use 2–10 letters or numbers, e.g. HQ");

const createSchema = z.object({
  code: outletCode,
  name: requiredText(80),
  address: optionalText(300),
  phone: optionalText(40),
});

const updateSchema = z.object({
  code: outletCode.optional(),
  name: requiredText(80).optional(),
  address: optionalText(300),
  phone: optionalText(40),
  isActive: z.boolean().optional(),
});

async function assertOutletLimit(ctx: ServiceContext): Promise<void> {
  if (!ctx.limits) return;
  const active = await ctx.db.outlet.count({ where: { isActive: true } });
  if (active >= ctx.limits.maxOutlets) {
    throw new ForbiddenError(`Your plan allows ${ctx.limits.maxOutlets} active outlet(s). Please upgrade your plan.`);
  }
}

export async function createOutlet(ctx: ServiceContext, input: unknown): Promise<OutletDTO> {
  assertCan(ctx, "outlets.manage");
  const data = parseInput(createSchema, input);
  await assertOutletLimit(ctx);
  try {
    const row = await ctx.db.outlet.create({
      data: { code: data.code, name: data.name, address: emptyToNull(data.address), phone: emptyToNull(data.phone) },
    });
    return toDto(row);
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new ConflictError(`Outlet code ${data.code} already exists`);
    throw error;
  }
}

export async function updateOutlet(ctx: ServiceContext, id: string, input: unknown): Promise<OutletDTO> {
  assertCan(ctx, "outlets.manage");
  const data = parseInput(updateSchema, input);
  const current = await getOutletOrThrow(ctx.db, id);

  if (data.isActive === false && current.isActive) {
    const otherActive = await ctx.db.outlet.count({ where: { isActive: true, id: { not: id } } });
    if (otherActive === 0) throw new ValidationError("At least one outlet must stay active");
  }
  if (data.isActive === true && !current.isActive) {
    await assertOutletLimit(ctx);
  }

  try {
    const row = await ctx.db.outlet.update({
      where: { id },
      data: {
        code: data.code,
        name: data.name,
        address: data.address === undefined ? undefined : emptyToNull(data.address),
        phone: data.phone === undefined ? undefined : emptyToNull(data.phone),
        isActive: data.isActive,
      },
    });
    return toDto(row);
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new ConflictError(`Outlet code ${data.code ?? ""} already exists`);
    throw error;
  }
}

/** Used when a tenant is provisioned (no permission check). */
export async function bootstrapOutlet(db: TenantDb, input: { code: string; name: string }): Promise<OutletDTO> {
  const row = await db.outlet.upsert({
    where: { code: input.code },
    create: { code: input.code, name: input.name },
    update: {},
  });
  return toDto(row);
}
