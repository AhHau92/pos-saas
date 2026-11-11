import { z } from "zod";
import type { TenantDb, TenantTx } from "@/lib/db/tenant";
import { ConflictError, NotFoundError, isPrismaError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { parseInput, requiredText } from "@/lib/validation";

export type PaymentMethodDTO = {
  id: string;
  name: string;
  isCash: boolean;
  isActive: boolean;
  sortOrder: number;
};

/** Singapore-friendly defaults; tenants can rename / add / disable them. */
export const DEFAULT_PAYMENT_METHODS: { name: string; isCash: boolean }[] = [
  { name: "Cash", isCash: true },
  { name: "NETS", isCash: false },
  { name: "Credit / Debit Card", isCash: false },
  { name: "PayNow", isCash: false },
  { name: "E-Wallet", isCash: false },
  { name: "Atome / BNPL", isCash: false },
  { name: "Bank Transfer", isCash: false },
];

export async function listPaymentMethods(db: TenantTx, options: { includeInactive?: boolean } = {}): Promise<PaymentMethodDTO[]> {
  const rows = await db.paymentMethod.findMany({
    where: options.includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, name: r.name, isCash: r.isCash, isActive: r.isActive, sortOrder: r.sortOrder }));
}

const schema = z.object({
  name: requiredText(40),
  isCash: z.boolean(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export async function createPaymentMethod(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  assertCan(ctx, "settings.manage");
  const data = parseInput(schema, input);
  try {
    const row = await ctx.db.paymentMethod.create({
      data: { name: data.name, isCash: data.isCash, isActive: data.isActive ?? true, sortOrder: data.sortOrder ?? 100 },
    });
    return { id: row.id };
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new ConflictError(`Payment method "${data.name}" already exists`);
    throw error;
  }
}

export async function updatePaymentMethod(ctx: ServiceContext, id: string, input: unknown): Promise<{ id: string }> {
  assertCan(ctx, "settings.manage");
  const data = parseInput(schema.partial(), input);
  const existing = await ctx.db.paymentMethod.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Payment method not found");
  try {
    await ctx.db.paymentMethod.update({
      where: { id },
      data: { name: data.name, isCash: data.isCash, isActive: data.isActive, sortOrder: data.sortOrder },
    });
    return { id };
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new ConflictError(`Payment method "${data.name ?? ""}" already exists`);
    throw error;
  }
}

export async function seedDefaultPaymentMethods(db: TenantDb): Promise<void> {
  await db.paymentMethod.createMany({
    data: DEFAULT_PAYMENT_METHODS.map((m, index) => ({ name: m.name, isCash: m.isCash, sortOrder: (index + 1) * 10 })),
    skipDuplicates: true,
  });
}
