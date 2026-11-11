import { z } from "zod";
import { nextSaleNumber } from "@/lib/doc-number";
import { ValidationError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { centsSchema, emptyToNull, idSchema, optionalText, parseInput, quantitySchema } from "@/lib/validation";
import { issueStock, type DocumentRef } from "@/modules/inventory";
import { getBusinessProfile } from "@/modules/settings";
import { resolveSaleCustomer, saleCustomerSchema } from "./customers.service";
import { allocatePayments, priceLines } from "./pricing";

const checkoutSchema = z.object({
  lines: z
    .array(
      z.object({
        variantId: idSchema,
        stockUnitId: idSchema.optional().nullable(),
        quantity: quantitySchema,
        unitPriceCents: centsSchema,
        discountCents: centsSchema.optional(),
      }),
    )
    .min(1, "The cart is empty")
    .max(200),
  payments: z
    .array(
      z.object({
        paymentMethodId: idSchema,
        amountCents: z.number().int().min(1).max(1_000_000_000),
        reference: optionalText(80),
      }),
    )
    .max(10),
  customer: saleCustomerSchema.optional().nullable(),
  notes: optionalText(500),
});

/**
 * POS checkout. One transaction: validate → price → allocate payments → number → stock out → save.
 * See docs/04-business-flows.md §3.
 */
export async function checkout(ctx: ServiceContext, input: unknown): Promise<{ id: string; number: string }> {
  assertCan(ctx, "pos.sell");
  const data = parseInput(checkoutSchema, input);

  const unitIds = data.lines.map((l) => l.stockUnitId).filter((id): id is string => Boolean(id));
  if (new Set(unitIds).size !== unitIds.length) throw new ValidationError("The same IMEI is in the cart twice");

  return ctx.db.$transaction(
    async (tx) => {
      const profile = await getBusinessProfile(tx);
      const outlet = await tx.outlet.findUnique({ where: { id: ctx.outletId } });
      if (!outlet || !outlet.isActive) throw new ValidationError("Current outlet is not active");

      const variantIds = [...new Set(data.lines.map((l) => l.variantId))];
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: true },
      });
      const variantById = new Map(variants.map((v) => [v.id, v]));
      data.lines.forEach((line, index) => {
        const v = variantById.get(line.variantId);
        if (!v || !v.isActive || !v.product.isActive) throw new ValidationError(`Line ${index + 1}: product not available`);
        if (v.product.type === "SERIALIZED") {
          if (!line.stockUnitId) throw new ValidationError(`Line ${index + 1}: choose the IMEI / serial number`);
          if (line.quantity !== 1) throw new ValidationError(`Line ${index + 1}: one line per IMEI`);
        } else if (line.stockUnitId) {
          throw new ValidationError(`Line ${index + 1}: this product is not tracked by IMEI`);
        }
      });

      const totals = priceLines(
        data.lines.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents, discountCents: l.discountCents ?? 0 })),
        profile.taxRateBps,
        profile.taxInclusive,
      );

      const methodIds = [...new Set(data.payments.map((p) => p.paymentMethodId))];
      const methods = await tx.paymentMethod.findMany({ where: { id: { in: methodIds }, isActive: true } });
      const methodById = new Map(methods.map((m) => [m.id, m]));
      if (methods.length !== methodIds.length) throw new ValidationError("Unknown or inactive payment method");
      const allocation =
        totals.totalCents === 0 && data.payments.length === 0
          ? { payments: [], paidCents: 0, changeCents: 0 }
          : allocatePayments(
              totals.totalCents,
              data.payments.map((p) => {
                const method = methodById.get(p.paymentMethodId)!;
                return {
                  paymentMethodId: method.id,
                  methodName: method.name,
                  isCash: method.isCash,
                  amountCents: p.amountCents,
                  reference: p.reference,
                };
              }),
            );

      const customerId = await resolveSaleCustomer(tx, data.customer);
      const number = await nextSaleNumber(tx, outlet.code);
      const sale = await tx.sale.create({
        data: {
          number,
          outletId: outlet.id,
          cashierId: ctx.userId,
          customerId,
          status: "COMPLETED",
          subtotalCents: totals.subtotalCents,
          discountCents: totals.discountCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          paidCents: allocation.paidCents,
          changeCents: allocation.changeCents,
          taxRateBps: profile.taxRateBps,
          taxInclusive: profile.taxInclusive,
          notes: emptyToNull(data.notes),
        },
      });
      const ref: DocumentRef = { refType: "SALE", refId: sale.id, refNo: number };

      for (let i = 0; i < data.lines.length; i++) {
        const line = data.lines[i];
        const priced = totals.lines[i];
        const issued = await issueStock(tx, {
          outletId: outlet.id,
          variantId: line.variantId,
          quantity: line.quantity,
          stockUnitId: line.stockUnitId ?? null,
          movementType: "SALE",
          unitStatus: "SOLD",
          ref,
          userId: ctx.userId,
        });
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            variantId: line.variantId,
            stockUnitId: line.stockUnitId ?? null,
            description: issued.label,
            sku: issued.sku,
            imei: issued.imei ?? issued.serialNumber,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            discountCents: priced.discountCents,
            taxCents: priced.taxCents,
            totalCents: priced.totalCents,
            unitCostCents: issued.unitCostCents,
          },
        });
      }

      if (allocation.payments.length > 0) {
        await tx.payment.createMany({
          data: allocation.payments.map((p) => ({
            saleId: sale.id,
            paymentMethodId: p.paymentMethodId,
            methodName: p.methodName,
            amountCents: p.amountCents,
            tenderedCents: p.tenderedCents,
            reference: p.reference,
          })),
        });
      }
      return { id: sale.id, number };
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
