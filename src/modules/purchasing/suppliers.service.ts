import { z } from "zod";
import type { TenantTx } from "@/lib/db/tenant";
import { NotFoundError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { emptyToNull, optionalText, parseInput, requiredText } from "@/lib/validation";

export type SupplierDTO = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};

const schema = z.object({
  name: requiredText(120),
  contactName: optionalText(80),
  phone: optionalText(40),
  email: optionalText(120),
  address: optionalText(300),
  notes: optionalText(1000),
  isActive: z.boolean().optional(),
});

function toDto(s: SupplierDTO): SupplierDTO {
  return {
    id: s.id,
    name: s.name,
    contactName: s.contactName,
    phone: s.phone,
    email: s.email,
    address: s.address,
    notes: s.notes,
    isActive: s.isActive,
  };
}

export async function listSuppliers(
  db: TenantTx,
  options: { q?: string; includeInactive?: boolean } = {},
): Promise<SupplierDTO[]> {
  const rows = await db.supplier.findMany({
    where: {
      isActive: options.includeInactive ? undefined : true,
      name: options.q ? { contains: options.q, mode: "insensitive" } : undefined,
    },
    orderBy: { name: "asc" },
    take: 500,
  });
  return rows.map(toDto);
}

export async function createSupplier(ctx: ServiceContext, input: unknown): Promise<SupplierDTO> {
  assertCan(ctx, "purchasing.manage");
  const data = parseInput(schema, input);
  const row = await ctx.db.supplier.create({
    data: {
      name: data.name,
      contactName: emptyToNull(data.contactName),
      phone: emptyToNull(data.phone),
      email: emptyToNull(data.email),
      address: emptyToNull(data.address),
      notes: emptyToNull(data.notes),
      isActive: data.isActive ?? true,
    },
  });
  return toDto(row);
}

export async function updateSupplier(ctx: ServiceContext, id: string, input: unknown): Promise<SupplierDTO> {
  assertCan(ctx, "purchasing.manage");
  const data = parseInput(schema, input);
  const existing = await ctx.db.supplier.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Supplier not found");
  const row = await ctx.db.supplier.update({
    where: { id },
    data: {
      name: data.name,
      contactName: emptyToNull(data.contactName),
      phone: emptyToNull(data.phone),
      email: emptyToNull(data.email),
      address: emptyToNull(data.address),
      notes: emptyToNull(data.notes),
      isActive: data.isActive ?? existing.isActive,
    },
  });
  return toDto(row);
}
