/**
 * Trade-in rules. Pure module (used by forms, services and tests).
 * See docs/04-business-flows.md §6.
 */

export const SELLER_ID_TYPES = ["NRIC", "FIN", "PASSPORT", "OTHER"] as const;
export type SellerIdType = (typeof SELLER_ID_TYPES)[number];

export const SELLER_ID_LABELS: Record<SellerIdType, string> = {
  NRIC: "NRIC",
  FIN: "FIN",
  PASSPORT: "Passport",
  OTHER: "Other ID",
};

/**
 * Normalises and checks an ID number. NRIC / FIN use the Singapore format (letter, 7 digits, letter);
 * passports and other IDs: 4–20 letters / digits. Throws with a readable message.
 */
export function normalizeSellerId(type: SellerIdType, raw: string): string {
  const value = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  if (type === "NRIC" || type === "FIN") {
    if (!/^[STFGM]\d{7}[A-Z]$/.test(value)) throw new Error(`${SELLER_ID_LABELS[type]} should look like S1234567A`);
    return value;
  }
  if (!/^[A-Z0-9]{4,20}$/.test(value)) throw new Error("ID number: 4–20 letters or digits");
  return value;
}

/** "S1234567A" → "•••••567A" (only the last 4 characters are shown). */
export function maskIdNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 4 ? value : `${"•".repeat(Math.min(5, value.length - 4))}${value.slice(-4)}`;
}

/** Condition checks shown for every device. `required` ones must be ticked to accept the device. */
export const TRADE_IN_CHECKS = [
  { key: "accountRemoved", label: "iCloud / Google account signed out (Find My / FRP off)", required: true },
  { key: "powersOn", label: "Powers on and charges", required: false },
  { key: "screenOk", label: "Screen and touch OK (no cracks, lines or dead spots)", required: false },
  { key: "bodyOk", label: "Body OK (no bends, cracks or deep dents)", required: false },
  { key: "camerasOk", label: "Front and back cameras OK", required: false },
  { key: "biometricsOk", label: "Face ID / fingerprint OK", required: false },
  { key: "audioOk", label: "Speakers, microphone and buttons OK", required: false },
  { key: "networkOk", label: "SIM, mobile network and Wi-Fi OK", required: false },
] as const;

export type TradeInCheckKey = (typeof TRADE_IN_CHECKS)[number]["key"];
export type TradeInChecklist = Partial<Record<TradeInCheckKey, boolean>>;

/** Required checks that are not ticked (empty = device can be accepted). */
export function missingRequiredChecks(checklist: TradeInChecklist | null | undefined): string[] {
  return TRADE_IN_CHECKS.filter((c) => c.required && !checklist?.[c.key]).map((c) => c.label);
}

/** Checks that were answered "no" — shown on the trade-in record and the unit's notes. */
export function failedChecks(checklist: TradeInChecklist | null | undefined): string[] {
  return TRADE_IN_CHECKS.filter((c) => checklist?.[c.key] === false).map((c) => c.label);
}

export function tradeInTotal(devices: { priceCents: number }[]): number {
  return devices.reduce((sum, d) => sum + d.priceCents, 0);
}

/** The words the seller signs on the trade-in slip. */
export function sellerDeclaration(businessName: string): string {
  return (
    `I declare that I am the lawful owner of the device(s) above; that they are not stolen, lost, ` +
    `financed or under a contract or instalment plan; and that I have removed my accounts and personal data. ` +
    `I sell them to ${businessName} for the amount stated.`
  );
}
