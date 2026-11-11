import { z } from "zod";
import { nextDocumentNumber } from "@/lib/doc-number";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { centsSchema, emptyToNull, idSchema, optionalText, parseInput } from "@/lib/validation";
import { changeUnitStatus, getUnitOutletId, issueStock, receiveStock, type DocumentRef } from "./stock.service";

export const ADJUSTMENT_REASONS = ["OPENING_STOCK", "STOCK_COUNT", "DAMAGED", "LOST", "FOUND", "REPAIRED", "OTHER"] as const;
export type AdjustmentReasonValue = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReasonValue, string> = {
  OPENING_STOCK: "Opening stock",
  STOCK_COUNT: "Stock count",
  DAMAGED: "Damaged",
  LOST: "Lost / stolen",
  FOUND: "Found",
  REPAIRED: "Repaired",
  OTHER: "Other",
};

export const incomingUnitSchema = z.object({
  imei: optionalText(20),
  imei2: optionalText(20),
  serialNumber: optionalText(40),
  grade: optionalText(5),
  batteryHealth: z.number().int().min(0).max(100).optional().nullable(),
  priceCents: centsSchema.optional().nullable(),
  notes: optionalText(200),
});

const adjustmentSchema = z.object({
  /** STOCK_IN: add stock (opening stock / found). STOCK_OUT: remove quantity items. UNIT_STATUS: change one IMEI. */
  kind: z.enum(["STOCK_IN", "STOCK_OUT", "UNIT_STATUS"]),
  reason: z.enum(ADJUSTMENT_REASONS),
  note: optionalText(500),
  outletId: idSchema.optional(),
  variantId: idSchema.optional(),
  quantity: z.number().int().min(1).max(100000).optional(),
  unitCostCents: centsSchema.optional(),
  units: z.array(incomingUnitSchema).max(1000).optional(),
  stockUnitId: idSchema.optional(),
  action: z.enum(["MARK_DEFECTIVE", "WRITE_OFF", "RESTORE"]).optional(),
});

export async function createAdjustment(ctx: ServiceContext, input: unknown): Promise<{ id: string; number: string }> {
  assertCan(ctx, "inventory.adjust");
  const data = parseInput(adjustmentSchema, input);
  const note = emptyToNull(data.note);

  return ctx.db.$transaction(
    async (tx) => {
      let outletId = data.outletId ?? ctx.outletId;
      if (data.kind === "UNIT_STATUS") {
        if (!data.stockUnitId || !data.action) throw new ValidationError("Choose the IMEI unit and the action");
        outletId = await getUnitOutletId(tx, data.stockUnitId);
      }
      const outlet = await tx.outlet.findUnique({ where: { id: outletId } });
      if (!outlet) throw new NotFoundError("Outlet not found");

      const number = await nextDocumentNumber(tx, "ADJ");
      const adjustment = await tx.stockAdjustment.create({
        data: { number, outletId, reason: data.reason, note, createdById: ctx.userId },
      });
      const ref: DocumentRef = { refType: "ADJUSTMENT", refId: adjustment.id, refNo: number };

      if (data.kind === "UNIT_STATUS") {
        await changeUnitStatus(tx, {
          stockUnitId: data.stockUnitId!,
          action: data.action!,
          ref,
          userId: ctx.userId,
          note,
        });
        return { id: adjustment.id, number };
      }

      if (!data.variantId) throw new ValidationError("Choose a product");
      const variant = await tx.productVariant.findUnique({ where: { id: data.variantId }, include: { product: true } });
      if (!variant) throw new NotFoundError("Product not found");

      if (data.kind === "STOCK_IN") {
        const isSerialized = variant.product.type === "SERIALIZED";
        const quantity = isSerialized ? (data.units?.length ?? 0) : (data.quantity ?? 0);
        if (quantity < 1) {
          throw new ValidationError(isSerialized ? "Scan at least one IMEI / serial number" : "Enter a quantity");
        }
        await receiveStock(tx, {
          outletId,
          variantId: variant.id,
          quantity,
          unitCostCents: data.unitCostCents ?? variant.costCents,
          units: isSerialized ? data.units : undefined,
          movementType: "ADJUSTMENT_IN",
          ref,
          userId: ctx.userId,
          note,
        });
        return { id: adjustment.id, number };
      }

      // STOCK_OUT (quantity items only; IMEI units use UNIT_STATUS)
      if (variant.product.type !== "NON_SERIALIZED") {
        throw new ValidationError("For IMEI products, change the status of each unit instead");
      }
      if (!data.quantity) throw new ValidationError("Enter a quantity");
      await issueStock(tx, {
        outletId,
        variantId: variant.id,
        quantity: data.quantity,
        movementType: "ADJUSTMENT_OUT",
        unitStatus: "WRITTEN_OFF",
        ref,
        userId: ctx.userId,
        note,
      });
      return { id: adjustment.id, number };
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
