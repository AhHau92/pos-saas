import { z } from "zod";
import type { TenantTx } from "@/lib/db/tenant";
import { nextDocumentNumber } from "@/lib/doc-number";
import { ValidationError } from "@/lib/errors";
import { formatDate } from "@/lib/time";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { centsSchema, emptyToNull, idSchema, optionalText, parseInput, requiredText } from "@/lib/validation";
import {
  findUnitByIdentifier,
  parseIdentifierToken,
  receiveStock,
  UNIT_STATUS_LABELS,
  type DocumentRef,
} from "@/modules/inventory";
import { variantLabel } from "@/modules/products";
import { getBusinessProfile } from "@/modules/settings";
import { resolveSaleCustomer } from "./customers.service";
import {
  failedChecks,
  missingRequiredChecks,
  normalizeSellerId,
  SELLER_ID_TYPES,
  TRADE_IN_CHECKS,
  tradeInTotal,
  type TradeInChecklist,
} from "./tradein";

const checklistSchema = z.object(
  Object.fromEntries(TRADE_IN_CHECKS.map((c) => [c.key, z.boolean().optional()])) as Record<
    (typeof TRADE_IN_CHECKS)[number]["key"],
    z.ZodOptional<z.ZodBoolean>
  >,
);

/** What the cashier enters for a trade-in (shared by the buy-back page and the POS). */
export const tradeInInputSchema = z.object({
  seller: z.object({
    name: requiredText(120),
    phone: optionalText(40),
    idType: z.enum(SELLER_ID_TYPES).optional().nullable(),
    idNumber: optionalText(30),
    address: optionalText(300),
  }),
  devices: z
    .array(
      z.object({
        variantId: idSchema,
        /** IMEI or serial number */
        identifier: requiredText(40),
        grade: optionalText(5),
        batteryHealth: z.number().int().min(0).max(100).optional().nullable(),
        checklist: checklistSchema.optional(),
        priceCents: centsSchema,
        notes: optionalText(300),
      }),
    )
    .min(1, "Add at least one device")
    .max(20),
  policeScreened: z.boolean().optional(),
  policeReference: optionalText(60),
  bookingRef: optionalText(40),
  notes: optionalText(500),
});
export type TradeInInput = z.infer<typeof tradeInInputSchema>;

const buyBackSchema = tradeInInputSchema.extend({
  paymentMethodId: idSchema,
  payoutReference: optionalText(80),
});

type Settlement =
  | { kind: "PAYOUT"; paymentMethodId: string; paymentMethodName: string; payoutReference: string | null }
  /** customerId: the sale's customer, used when the seller gives no phone number */
  | { kind: "SALE_CREDIT"; saleId: string; customerId: string | null };

/**
 * Records a trade-in inside the caller's transaction: checks the seller / device rules, numbers the
 * document (TI-…), puts every device into stock at the outlet (cost = trade-in price, ledger TRADE_IN)
 * and saves the record. A device we sold before is "re-acquired": same IMEI history, new variant
 * (e.g. the used one), status back to IN_STOCK.
 */
export async function recordTradeIn(
  tx: TenantTx,
  ctx: ServiceContext,
  data: TradeInInput,
  settlement: Settlement,
): Promise<{ id: string; number: string; totalCents: number }> {
  const profile = await getBusinessProfile(tx);

  // seller particulars (Singapore Secondhand Goods Dealers Rules: name, ID no., address)
  let idNumber: string | null = null;
  const rawId = emptyToNull(data.seller.idNumber);
  if (rawId) {
    if (!data.seller.idType) throw new ValidationError("Choose the seller's ID type");
    try {
      idNumber = normalizeSellerId(data.seller.idType, rawId);
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error));
    }
  }
  const address = emptyToNull(data.seller.address);
  if (profile.tradeInRequireSellerId && (!idNumber || !address)) {
    throw new ValidationError("Enter the seller's ID number and address (required for trade-ins)");
  }
  if (profile.tradeInRequirePoliceCheck && !data.policeScreened) {
    throw new ValidationError("Screen the device(s) on the Police secondhand goods system first, then tick the box");
  }

  // devices
  const variantIds = [...new Set(data.devices.map((d) => d.variantId))];
  const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds } }, include: { product: true } });
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const seen = new Set<string>();
  const devices = data.devices.map((d, index) => {
    const v = variantById.get(d.variantId);
    if (!v || !v.isActive || !v.product.isActive) throw new ValidationError(`Device ${index + 1}: choose a model`);
    if (v.product.type !== "SERIALIZED") {
      throw new ValidationError(`Device ${index + 1}: ${v.product.name} is not tracked by IMEI / serial number`);
    }
    let parsed;
    try {
      parsed = parseIdentifierToken(d.identifier);
    } catch (error) {
      throw new ValidationError(`Device ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (parsed.length !== 1) throw new ValidationError(`Device ${index + 1}: enter one IMEI / serial number`);
    const id = parsed[0];
    const key = id.imei ?? id.serialNumber ?? "";
    if (seen.has(key)) throw new ValidationError(`${key} is entered twice`);
    seen.add(key);
    const checklist: TradeInChecklist = d.checklist ?? {};
    const missing = missingRequiredChecks(checklist);
    if (missing.length > 0) throw new ValidationError(`${key}: ${missing[0]} — required before buying the device`);
    return { input: d, variant: v, imei: id.imei, serialNumber: id.serialNumber, key, checklist };
  });

  const totalCents = tradeInTotal(data.devices);
  const number = await nextDocumentNumber(tx, "TI");
  // Link to a customer by phone; without a phone, a trade-in in a sale belongs to the sale's customer
  // (no new customer record per walk-in seller — the particulars are on the trade-in itself).
  const customerId = emptyToNull(data.seller.phone)
    ? await resolveSaleCustomer(tx, { name: data.seller.name, phone: data.seller.phone })
    : settlement.kind === "SALE_CREDIT"
      ? settlement.customerId
      : null;

  const tradeIn = await tx.tradeIn.create({
    data: {
      number,
      outletId: ctx.outletId,
      createdById: ctx.userId,
      customerId,
      sellerName: data.seller.name,
      sellerIdType: idNumber ? (data.seller.idType ?? null) : null,
      sellerIdNumber: idNumber,
      sellerPhone: emptyToNull(data.seller.phone),
      sellerAddress: address,
      policeScreened: Boolean(data.policeScreened),
      policeReference: emptyToNull(data.policeReference),
      bookingRef: emptyToNull(data.bookingRef),
      totalCents,
      settlement: settlement.kind,
      paymentMethodId: settlement.kind === "PAYOUT" ? settlement.paymentMethodId : null,
      paymentMethodName: settlement.kind === "PAYOUT" ? settlement.paymentMethodName : null,
      payoutReference: settlement.kind === "PAYOUT" ? settlement.payoutReference : null,
      saleId: settlement.kind === "SALE_CREDIT" ? settlement.saleId : null,
      notes: emptyToNull(data.notes),
    },
  });
  const ref: DocumentRef = { refType: "TRADE_IN", refId: tradeIn.id, refNo: number };

  for (const d of devices) {
    const failed = failedChecks(d.checklist);
    const unitNotes = [emptyToNull(d.input.notes), failed.length > 0 ? `Trade-in issues: ${failed.join("; ")}` : null]
      .filter(Boolean)
      .join(" · ");
    const received = await receiveStock(tx, {
      outletId: ctx.outletId,
      variantId: d.variant.id,
      quantity: 1,
      unitCostCents: d.input.priceCents,
      units: [
        {
          imei: d.imei,
          serialNumber: d.serialNumber,
          grade: d.input.grade ?? null,
          batteryHealth: d.input.batteryHealth ?? null,
          notes: unitNotes || null,
        },
      ],
      movementType: "TRADE_IN",
      ref,
      userId: ctx.userId,
      note: `Trade-in from ${data.seller.name}`,
    });
    await tx.tradeInItem.create({
      data: {
        tradeInId: tradeIn.id,
        variantId: d.variant.id,
        stockUnitId: received.stockUnitIds[0],
        description: variantLabel(d.variant.product.name, d.variant),
        identifier: d.key,
        grade: d.input.grade ? d.input.grade.toUpperCase() : null,
        batteryHealth: d.input.batteryHealth ?? null,
        checklist: d.checklist,
        priceCents: d.input.priceCents,
      },
    });
  }
  return { id: tradeIn.id, number, totalCents };
}

/** Buy-back: the customer sells devices and is paid (cash / PayNow / bank transfer …). */
export async function createBuyBack(ctx: ServiceContext, input: unknown): Promise<{ id: string; number: string }> {
  assertCan(ctx, "tradeins.create");
  const data = parseInput(buyBackSchema, input);
  return ctx.db.$transaction(
    async (tx) => {
      const method = await tx.paymentMethod.findUnique({ where: { id: data.paymentMethodId } });
      if (!method || !method.isActive || method.isTradeIn) throw new ValidationError("Choose how the customer is paid");
      const result = await recordTradeIn(tx, ctx, data, {
        kind: "PAYOUT",
        paymentMethodId: method.id,
        paymentMethodName: method.name,
        payoutReference: emptyToNull(data.payoutReference),
      });
      return { id: result.id, number: result.number };
    },
    { timeout: 30000, maxWait: 10000 },
  );
}

export type TradeInDeviceLookup =
  | { status: "NEW" }
  | { status: "BLOCKED"; message: string }
  | {
      status: "KNOWN";
      message: string;
      /** The variant it had in our system (suggestion only — a used variant is usually right) */
      variant: { id: string; label: string };
    };

/**
 * IMEI check before buying: blocks devices that are in our stock (or on the way), and shows the
 * history of devices we sold before ("sold on … to …") — useful against fraud and for warranty.
 */
export async function lookupTradeInDevice(ctx: ServiceContext, identifier: string): Promise<TradeInDeviceLookup> {
  assertCan(ctx, "tradeins.create");
  const unit = await findUnitByIdentifier(ctx.db, identifier);
  if (!unit) return { status: "NEW" };
  const label = variantLabel(unit.variant.product.name, unit.variant);
  if (unit.status !== "SOLD" && unit.status !== "WRITTEN_OFF") {
    return {
      status: "BLOCKED",
      message: `${unit.imei ?? unit.serialNumber} is ${UNIT_STATUS_LABELS[unit.status]} in our system (${unit.outlet.code}) — it cannot be bought in.`,
    };
  }
  const lastSale = await ctx.db.saleItem.findFirst({
    where: { stockUnitId: unit.id },
    orderBy: { sale: { createdAt: "desc" } },
    include: { sale: { include: { customer: true } } },
  });
  const message = lastSale
    ? `Sold by us on ${formatDate(lastSale.sale.createdAt)} (${lastSale.sale.number}${
        lastSale.sale.customer ? `, ${lastSale.sale.customer.name}` : ""
      }) as ${label}.`
    : `Known device (${label}, ${UNIT_STATUS_LABELS[unit.status]}).`;
  return { status: "KNOWN", message, variant: { id: unit.variantId, label } };
}
