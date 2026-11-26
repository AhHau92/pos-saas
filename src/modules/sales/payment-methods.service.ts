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

/** Tender methods (Cash, NETS, PayNow …). The system "Trade-in" method is never listed: it is only used by trade-ins. */
export async function listPaymentMethods(db: TenantTx, options: { includeInactive?: boolean } = {}): Promise<PaymentMethodDTO[]> {
  const rows = await db.paymentMethod.findMany({
    where: options.includeInactive ? { isTradeIn: false } : { isActive: true, isTradeIn: false },
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
  if (!existing || existing.isTradeIn) throw new NotFoundError("Payment method not found");
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

/**
 * The system payment method that records trade-in credit on a sale ("paid with a trade-in").
 * Created on first use; an existing method called "Trade-in" is taken over.
 */
export async function ensureTradeInPaymentMethod(tx: TenantTx): Promise<{ id: string; name: string }> {
  const existing = await tx.paymentMethod.findFirst({ where: { isTradeIn: true } });
  if (existing) return { id: existing.id, name: existing.name };
  const row = await tx.paymentMethod.upsert({
    where: { name: "Trade-in" },
    create: { name: "Trade-in", isCash: false, isTradeIn: true, isActive: true, sortOrder: 999 },
    update: { isTradeIn: true, isCash: false, isActive: true },
  });
  return { id: row.id, name: row.name };
}
