import { z } from "zod";
import { nextDocumentNumber } from "@/lib/doc-number";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { emptyToNull, idSchema, optionalText, parseInput, quantitySchema } from "@/lib/validation";
import { returnStock, type DocumentRef } from "@/modules/inventory";
import { refundAmountForLine } from "./pricing";

const refundSchema = z.object({
  items: z
    .array(
      z.object({
        saleItemId: idSchema,
        quantity: quantitySchema,
        /** RESTOCK = sellable again; DEFECTIVE = faulty, not back into sellable stock */
        disposition: z.enum(["RESTOCK", "DEFECTIVE"]),
      }),
    )
    .min(1, "Choose at least one item to refund"),
  paymentMethodId: idSchema,
  reason: optionalText(300),
});

/** Full or partial refund. Returned goods go to the CURRENT outlet. See docs/04-business-flows.md §4. */
export async function refundSale(
  ctx: ServiceContext,
  saleId: string,
  input: unknown,
): Promise<{ id: string; number: string; totalCents: number }> {
  assertCan(ctx, "sales.refund");
  const data = parseInput(refundSchema, input);
  const ids = data.items.map((i) => i.saleItemId);
  if (new Set(ids).size !== ids.length) throw new ValidationError("The same line appears twice");

  return ctx.db.$transaction(
    async (tx) => {
      // One refund at a time per sale
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
      const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
      if (!sale) throw new NotFoundError("Sale not found");
      if (sale.status === "REFUNDED") throw new ConflictError("This sale is already fully refunded");

      const method = await tx.paymentMethod.findUnique({ where: { id: data.paymentMethodId } });
      if (!method || !method.isActive) throw new ValidationError("Unknown or inactive refund method");

      const itemById = new Map(sale.items.map((i) => [i.id, i]));
      const lines = data.items.map((line) => {
        const item = itemById.get(line.saleItemId);
        if (!item) throw new ValidationError("Line does not belong to this sale");
        return { line, item, amountCents: refundAmountForLine(item, line.quantity) };
      });
      const totalCents = lines.reduce((s, l) => s + l.amountCents, 0);

      const number = await nextDocumentNumber(tx, "RF");
      const refund = await tx.refund.create({
        data: {
          number,
          saleId: sale.id,
          outletId: ctx.outletId,
          paymentMethodId: method.id,
          methodName: method.name,
          totalCents,
          reason: emptyToNull(data.reason),
          createdById: ctx.userId,
        },
      });
      const ref: DocumentRef = { refType: "REFUND", refId: refund.id, refNo: number };

      for (const { line, item, amountCents } of lines) {
        await returnStock(tx, {
          outletId: ctx.outletId,
          variantId: item.variantId,
          quantity: line.quantity,
          stockUnitId: item.stockUnitId,
          disposition: line.disposition,
          unitCostCents: item.unitCostCents,
          ref,
          userId: ctx.userId,
          note: emptyToNull(data.reason),
        });
        await tx.refundItem.create({
          data: {
            refundId: refund.id,
            saleItemId: item.id,
            quantity: line.quantity,
            amountCents,
            disposition: line.disposition,
          },
        });
        await tx.saleItem.update({
          where: { id: item.id },
          data: { refundedQuantity: { increment: line.quantity }, refundedCents: { increment: amountCents } },
        });
      }

      const refundedQty = new Map(lines.map((l) => [l.item.id, l.line.quantity]));
      const fullyRefunded = sale.items.every((i) => i.refundedQuantity + (refundedQty.get(i.id) ?? 0) >= i.quantity);
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          refundedCents: { increment: totalCents },
          status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
        },
      });
      return { id: refund.id, number, totalCents };
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
