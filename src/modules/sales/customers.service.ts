import { z } from "zod";
import type { TenantTx } from "@/lib/db/tenant";
import { ConflictError, ValidationError, isPrismaError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { emptyToNull, idSchema, optionalText, parseInput, requiredText } from "@/lib/validation";

export type CustomerDTO = { id: string; name: string; phone: string | null; email: string | null };

/** Keeps digits and a leading +, e.g. "+65 9123 4567" → "+6591234567" */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export async function searchCustomers(db: TenantTx, q: string, take = 10): Promise<CustomerDTO[]> {
  const query = q.trim();
  if (!query) return [];
  const phone = normalizePhone(query);
  const rows = await db.customer.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        ...(phone ? [{ phone: { contains: phone } }] : []),
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take,
  });
  return rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }));
}

const createSchema = z.object({
  name: requiredText(80),
  phone: optionalText(30),
  email: optionalText(120),
  notes: optionalText(500),
});

export async function createCustomer(ctx: ServiceContext, input: unknown): Promise<CustomerDTO> {
  assertCan(ctx, "customers.manage");
  const data = parseInput(createSchema, input);
  try {
    const c = await ctx.db.customer.create({
      data: {
        name: data.name,
        phone: normalizePhone(data.phone),
        email: emptyToNull(data.email),
        notes: emptyToNull(data.notes),
      },
    });
    return { id: c.id, name: c.name, phone: c.phone, email: c.email };
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new ConflictError("A customer with this phone number already exists");
    throw error;
  }
}

export const saleCustomerSchema = z.object({
  id: idSchema.optional().nullable(),
  name: optionalText(80),
  phone: optionalText(30),
  email: optionalText(120),
});

/** POS: use an existing customer, or find-or-create by phone number. Returns null for walk-in sales. */
export async function resolveSaleCustomer(
  tx: TenantTx,
  input: z.infer<typeof saleCustomerSchema> | null | undefined,
): Promise<string | null> {
  if (!input) return null;
  if (input.id) {
    const existing = await tx.customer.findUnique({ where: { id: input.id } });
    if (!existing) throw new ValidationError("Customer not found");
    return existing.id;
  }
  const phone = normalizePhone(input.phone);
  const name = emptyToNull(input.name);
  if (!phone && !name) return null;
  if (phone) {
    const existing = await tx.customer.findUnique({ where: { phone } });
    if (existing) {
      if (name && existing.name !== name) await tx.customer.update({ where: { id: existing.id }, data: { name } });
      return existing.id;
    }
  }
  const created = await tx.customer.create({
    data: { name: name ?? phone ?? "Customer", phone, email: emptyToNull(input.email) },
  });
  return created.id;
}
