import { z } from "zod";
import type { TenantTx } from "@/lib/db/tenant";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { emptyToNull, optionalText, parseInput, requiredText } from "@/lib/validation";

export type CompanyDTO = {
  id: string;
  name: string;
  registrationNo: string | null;
  gstRegistered: boolean;
  taxRegistrationNo: string | null;
  address: string | null;
  isActive: boolean;
  outletCodes: string[];
};

export async function listCompanies(db: TenantTx, options: { includeInactive?: boolean } = {}): Promise<CompanyDTO[]> {
  const rows = await db.company.findMany({
    where: options.includeInactive ? undefined : { isActive: true },
    include: { outlets: { select: { code: true }, orderBy: { code: "asc" } } },
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    registrationNo: c.registrationNo,
    gstRegistered: c.gstRegistered,
    taxRegistrationNo: c.taxRegistrationNo,
    address: c.address,
    isActive: c.isActive,
    outletCodes: c.outlets.map((o) => o.code),
  }));
}

const schema = z.object({
  name: requiredText(120),
  registrationNo: optionalText(40),
  gstRegistered: z.boolean(),
  taxRegistrationNo: optionalText(40),
  address: optionalText(300),
  isActive: z.boolean().optional(),
});

function toData(data: z.infer<typeof schema>) {
  const taxRegistrationNo = emptyToNull(data.taxRegistrationNo);
  if (data.gstRegistered && !taxRegistrationNo) {
    throw new ValidationError("Enter the GST registration no. (or untick “GST registered”)");
  }
  return {
    name: data.name,
    registrationNo: emptyToNull(data.registrationNo),
    gstRegistered: data.gstRegistered,
    taxRegistrationNo: data.gstRegistered ? taxRegistrationNo : null,
    address: emptyToNull(data.address),
  };
}

export async function createCompany(ctx: ServiceContext, input: unknown): Promise<{ id: string }> {
  assertCan(ctx, "outlets.manage");
  const data = parseInput(schema, input);
  const row = await ctx.db.company.create({ data: toData(data) });
  return { id: row.id };
}

export async function updateCompany(ctx: ServiceContext, id: string, input: unknown): Promise<{ id: string }> {
  assertCan(ctx, "outlets.manage");
  const data = parseInput(schema, input);
  const existing = await ctx.db.company.findUnique({ where: { id }, include: { outlets: { where: { isActive: true } } } });
  if (!existing) throw new NotFoundError("Company not found");
  if (data.isActive === false && existing.outlets.length > 0) {
    throw new ValidationError("Move its outlets to another company before deactivating it");
  }
  await ctx.db.company.update({ where: { id }, data: { ...toData(data), isActive: data.isActive ?? existing.isActive } });
  return { id };
}
