import { z } from "zod";
import { nextSaleNumber } from "@/lib/doc-number";
import { ValidationError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { normalizeEmail } from "@/lib/contact";
import { centsSchema, emptyToNull, idSchema, optionalEmail, optionalText, parseInput, quantitySchema } from "@/lib/validation";
import { issueStock, type DocumentRef } from "@/modules/inventory";
import { getOutletTax } from "@/modules/outlets";
import { getBusinessProfile } from "@/modules/settings";
import { resolveSaleCustomer, saleCustomerSchema } from "./customers.service";
import { ensureTradeInPaymentMethod } from "./payment-methods.service";
import { allocatePayments, priceLines } from "./pricing";
import { buildReceiptHeader } from "./receipt";
import { newReceiptToken } from "./receipt.service";
import { tradeInTotal } from "./tradein";
import { recordTradeIn, tradeInInputSchema } from "./tradein.service";

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
  /** Optional: where to email the e-receipt (also saved to the customer if they have no email yet) */
  receiptEmail: optionalEmail(),
  /** Optional: the customer's old device(s) as part payment (换购). GST is still on the full sale price. */
  tradeIn: tradeInInputSchema.optional().nullable(),
  notes: optionalText(500),
});

/**
 * POS checkout. One transaction: validate → price → allocate payments → number → stock out → save.
 * See docs/04-business-flows.md §3.
 */
export async function checkout(
  ctx: ServiceContext,
  input: unknown,
): Promise<{ id: string; number: string; tradeIn: { id: string; number: string } | null }> {
  assertCan(ctx, "pos.sell");
  const data = parseInput(checkoutSchema, input);
  if (data.tradeIn) assertCan(ctx, "tradeins.create");
  const tradeInCredit = data.tradeIn ? tradeInTotal(data.tradeIn.devices) : 0;

  const unitIds = data.lines.map((l) => l.stockUnitId).filter((id): id is string => Boolean(id));
  if (new Set(unitIds).size !== unitIds.length) throw new ValidationError("The same IMEI is in the cart twice");

  return ctx.db.$transaction(
    async (tx) => {
      const profile = await getBusinessProfile(tx);
      const outlet = await tx.outlet.findUnique({ where: { id: ctx.outletId } });
      if (!outlet || !outlet.isActive) throw new ValidationError("Current outlet is not active");
      const cashier = await tx.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
      // GST depends on the company this outlet trades as (not registered → no GST)
      const tax = await getOutletTax(tx, outlet.id, profile);

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
        tax.taxRateBps,
        tax.taxInclusive,
      );

      // trade-in credit pays part of the sale; the rest is paid with the tenders
      if (tradeInCredit > totals.totalCents) {
        throw new ValidationError("The trade-in is worth more than this sale — record it as a buy-back (Trade-ins) instead");
      }
      const dueCents = totals.totalCents - tradeInCredit;

      const methodIds = [...new Set(data.payments.map((p) => p.paymentMethodId))];
      const methods = await tx.paymentMethod.findMany({ where: { id: { in: methodIds }, isActive: true, isTradeIn: false } });
      const methodById = new Map(methods.map((m) => [m.id, m]));
      if (methods.length !== methodIds.length) throw new ValidationError("Unknown or inactive payment method");
      const allocation =
        dueCents === 0 && data.payments.length === 0
          ? { payments: [], paidCents: 0, changeCents: 0 }
          : allocatePayments(
              dueCents,
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

      const receiptEmail = data.receiptEmail ? normalizeEmail(data.receiptEmail) : null;
      const customerId = await resolveSaleCustomer(tx, data.customer, receiptEmail);
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
          paidCents: allocation.paidCents + tradeInCredit,
          changeCents: allocation.changeCents,
          taxRateBps: tax.taxRateBps,
          taxInclusive: tax.taxInclusive,
          // receipt snapshot: later changes to settings / outlet / user do not change this receipt
          currency: profile.currency,
          taxName: profile.taxName,
          receiptHeader: buildReceiptHeader({ profile, outlet, cashierName: cashier?.name ?? "", legal: tax }),
          receiptToken: newReceiptToken(),
          receiptEmail,
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

      let tradeIn: { id: string; number: string } | null = null;
      if (data.tradeIn) {
        const recorded = await recordTradeIn(tx, ctx, data.tradeIn, { kind: "SALE_CREDIT", saleId: sale.id, customerId });
        const traded = await tx.tradeInItem.findMany({ where: { tradeInId: recorded.id }, select: { stockUnitId: true } });
        if (traded.some((t) => unitIds.includes(t.stockUnitId))) {
          throw new ValidationError("A device cannot be sold and traded in in the same sale");
        }
        tradeIn = { id: recorded.id, number: recorded.number };
        if (tradeInCredit > 0) {
          const method = await ensureTradeInPaymentMethod(tx);
          await tx.payment.create({
            data: {
              saleId: sale.id,
              paymentMethodId: method.id,
              methodName: method.name,
              amountCents: tradeInCredit,
              tenderedCents: null,
              reference: recorded.number,
            },
          });
        }
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
      return { id: sale.id, number, tradeIn };
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
