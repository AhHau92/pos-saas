/**
 * Money helpers. All amounts in the system are integer cents.
 * Pure functions — safe to use in client components.
 */

const LOCALE_BY_CURRENCY: Record<string, string> = {
  SGD: "en-SG",
  MYR: "en-MY",
  USD: "en-US",
  HKD: "en-HK",
  AUD: "en-AU",
};

export function formatMoney(cents: number, currency = "SGD"): string {
  const locale = LOCALE_BY_CURRENCY[currency] ?? "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

/** 129950 -> "1299.50" (for input fields) */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * "1,299.5" -> 129950. Returns null for invalid input.
 * String parsing avoids floating point errors (e.g. 0.29 * 100).
 */
export function parseMoneyToCents(input: string | number): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  const s = input.trim().replace(/,/g, "").replace(/^\$/, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  const negative = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
