import { z } from "zod";
import type { TenantDb, TenantTx } from "@/lib/db/tenant";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { emptyToNull, optionalText, parseInput, requiredText } from "@/lib/validation";

export type BusinessProfileDTO = {
  name: string;
  registrationNo: string | null;
  taxRegistrationNo: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  taxName: string;
  /** 900 = 9% */
  taxRateBps: number;
  taxInclusive: boolean;
  receiptFooter: string | null;
};

type ProfileRow = {
  name: string;
  registrationNo: string | null;
  taxRegistrationNo: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  taxName: string;
  taxRateBps: number;
  taxInclusive: boolean;
  receiptFooter: string | null;
};

function toDto(row: ProfileRow): BusinessProfileDTO {
  return {
    name: row.name,
    registrationNo: row.registrationNo,
    taxRegistrationNo: row.taxRegistrationNo,
    address: row.address,
    phone: row.phone,
    email: row.email,
    currency: row.currency,
    taxName: row.taxName,
    taxRateBps: row.taxRateBps,
    taxInclusive: row.taxInclusive,
    receiptFooter: row.receiptFooter,
  };
}

export async function getBusinessProfile(db: TenantTx): Promise<BusinessProfileDTO> {
  const row = await db.businessProfile.findUnique({ where: { id: 1 } });
  if (row) return toDto(row);
  const created = await db.businessProfile.upsert({
    where: { id: 1 },
    create: { id: 1, name: "My Shop" },
    update: {},
  });
  return toDto(created);
}

const businessProfileSchema = z.object({
  name: requiredText(120),
  registrationNo: optionalText(40),
  taxRegistrationNo: optionalText(40),
  address: optionalText(300),
  phone: optionalText(40),
  email: optionalText(120),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. SGD"),
  taxName: requiredText(20),
  taxRateBps: z.number().int().min(0).max(5000),
  taxInclusive: z.boolean(),
  receiptFooter: optionalText(500),
});

export async function updateBusinessProfile(ctx: ServiceContext, input: unknown): Promise<BusinessProfileDTO> {
  assertCan(ctx, "settings.manage");
  const data = parseInput(businessProfileSchema, input);
  const values = {
    name: data.name,
    registrationNo: emptyToNull(data.registrationNo),
    taxRegistrationNo: emptyToNull(data.taxRegistrationNo),
    address: emptyToNull(data.address),
    phone: emptyToNull(data.phone),
    email: emptyToNull(data.email),
    currency: data.currency,
    taxName: data.taxName,
    taxRateBps: data.taxRateBps,
    taxInclusive: data.taxInclusive,
    receiptFooter: emptyToNull(data.receiptFooter),
  };
  const row = await ctx.db.businessProfile.upsert({
    where: { id: 1 },
    create: { id: 1, ...values },
    update: values,
  });
  return toDto(row);
}

/** Used when a new tenant is provisioned. Does not overwrite an existing profile. */
export async function initBusinessProfile(
  db: TenantDb,
  input: { name: string; currency?: string; taxName?: string; taxRateBps?: number; taxInclusive?: boolean },
): Promise<void> {
  await db.businessProfile.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      name: input.name,
      currency: input.currency ?? "SGD",
      taxName: input.taxName ?? "GST",
      taxRateBps: input.taxRateBps ?? 900,
      taxInclusive: input.taxInclusive ?? true,
      receiptFooter: "Thank you for shopping with us!",
    },
    update: {},
  });
}
