/**
 * Sale pricing, tax and payment allocation. Pure module — the POS screen uses the same
 * functions for its live preview; the server recomputes everything on checkout.
 */
import { ValidationError } from "@/lib/errors";

export type PricingLine = { quantity: number; unitPriceCents: number; discountCents: number };

export type PricedLine = PricingLine & {
  /** unit price × quantity */
  grossCents: number;
  /** gross − discount */
  netCents: number;
  taxCents: number;
  /** what the customer pays for this line */
  totalCents: number;
};

export type SaleTotals = {
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
};

/** Tax contained in (inclusive) or added to (exclusive) a net amount. taxRateBps: 900 = 9%. */
export function lineTax(netCents: number, taxRateBps: number, taxInclusive: boolean): number {
  if (taxRateBps <= 0 || netCents <= 0) return 0;
  return taxInclusive
    ? Math.round((netCents * taxRateBps) / (10000 + taxRateBps))
    : Math.round((netCents * taxRateBps) / 10000);
}

export function priceLines(lines: PricingLine[], taxRateBps: number, taxInclusive: boolean): SaleTotals {
  const priced = lines.map((line, index) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new ValidationError(`Line ${index + 1}: quantity must be a positive whole number`);
    }
    if (!Number.isInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
      throw new ValidationError(`Line ${index + 1}: invalid price`);
    }
    if (!Number.isInteger(line.discountCents) || line.discountCents < 0) {
      throw new ValidationError(`Line ${index + 1}: invalid discount`);
    }
    const grossCents = line.unitPriceCents * line.quantity;
    if (line.discountCents > grossCents) {
      throw new ValidationError(`Line ${index + 1}: discount is larger than the line amount`);
    }
    const netCents = grossCents - line.discountCents;
    const taxCents = lineTax(netCents, taxRateBps, taxInclusive);
    const totalCents = taxInclusive ? netCents : netCents + taxCents;
    return { ...line, grossCents, netCents, taxCents, totalCents };
  });
  return {
    lines: priced,
    subtotalCents: priced.reduce((s, l) => s + l.netCents, 0),
    discountCents: priced.reduce((s, l) => s + l.discountCents, 0),
    taxCents: priced.reduce((s, l) => s + l.taxCents, 0),
    totalCents: priced.reduce((s, l) => s + l.totalCents, 0),
  };
}

export type PaymentInput = {
  paymentMethodId: string;
  methodName: string;
  isCash: boolean;
  amountCents: number;
  reference?: string | null;
};

export type AllocatedPayment = {
  paymentMethodId: string;
  methodName: string;
  /** Applied to the sale */
  amountCents: number;
  /** Cash tendered (cash only) */
  tenderedCents: number | null;
  reference: string | null;
};

/**
 * Validates payments against the sale total. Only cash may exceed the amount due (change is given);
 * the applied cash amount is reduced by the change so that Σ applied = total.
 */
export function allocatePayments(
  totalCents: number,
  payments: PaymentInput[],
): { payments: AllocatedPayment[]; paidCents: number; changeCents: number } {
  for (const p of payments) {
    if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) {
      throw new ValidationError(`${p.methodName}: amount must be greater than 0`);
    }
  }
  const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
  if (paidCents < totalCents) {
    throw new ValidationError(`Payment is short by ${((totalCents - paidCents) / 100).toFixed(2)}`);
  }
  const nonCashCents = payments.filter((p) => !p.isCash).reduce((s, p) => s + p.amountCents, 0);
  if (nonCashCents > totalCents) {
    throw new ValidationError("Card / e-wallet payments cannot be more than the amount due");
  }
  const changeCents = paidCents - totalCents;

  const allocated: AllocatedPayment[] = payments.map((p) => ({
    paymentMethodId: p.paymentMethodId,
    methodName: p.methodName,
    amountCents: p.amountCents,
    tenderedCents: p.isCash ? p.amountCents : null,
    reference: p.reference?.trim() ? p.reference.trim() : null,
  }));
  let remainingChange = changeCents;
  for (let i = allocated.length - 1; i >= 0 && remainingChange > 0; i--) {
    if (allocated[i].tenderedCents === null) continue;
    const reduce = Math.min(allocated[i].amountCents, remainingChange);
    allocated[i].amountCents -= reduce;
    remainingChange -= reduce;
  }
  if (allocated.some((p) => p.amountCents === 0)) {
    throw new ValidationError("A cash payment is not needed — the other payments already cover the total");
  }
  return { payments: allocated, paidCents, changeCents };
}

/**
 * Refund amount for `quantity` units of a sale line (proportional, incl. tax).
 * The last refund of a line takes the exact remainder so rounding never leaves cents behind.
 */
export function refundAmountForLine(
  line: { quantity: number; totalCents: number; refundedQuantity: number; refundedCents: number },
  quantity: number,
): number {
  const remaining = line.quantity - line.refundedQuantity;
  if (!Number.isInteger(quantity) || quantity <= 0) throw new ValidationError("Refund quantity must be at least 1");
  if (quantity > remaining) throw new ValidationError(`Only ${remaining} left to refund on this line`);
  if (quantity === remaining) return line.totalCents - line.refundedCents;
  return Math.round((line.totalCents * quantity) / line.quantity);
}
