/**
 * IMEI / serial number helpers. Pure module (used by forms and services).
 */

/** Uppercase, strip spaces, dashes, slashes and dots. */
export function normalizeIdentifier(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s\-/.]+/g, "");
}

/** Luhn checksum (the 15th IMEI digit is a Luhn check digit). */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isValidImei(value: string): boolean {
  return /^\d{15}$/.test(value) && luhnValid(value);
}

export function looksLikeImei(value: string): boolean {
  return /^\d{14,17}$/.test(value);
}

export function isValidSerial(value: string): boolean {
  return /^[A-Z0-9]{5,40}$/.test(value);
}

// ───────────── grades (used / refurbished phones) ─────────────

/** Kept short on purpose: grades are shown on unit lists and the POS. */
export const UNIT_GRADES = ["A+", "A", "B", "C", "D"] as const;
export type UnitGrade = (typeof UNIT_GRADES)[number];

/** "a" → "A", "" → null. Anything that is not a known grade throws. */
export function normalizeGrade(raw: string | null | undefined): UnitGrade | null {
  const value = (raw ?? "").trim().toUpperCase();
  if (!value) return null;
  const grade = UNIT_GRADES.find((g) => g === value);
  if (!grade) throw new Error(`Grade "${raw}" is not valid. Use one of: ${UNIT_GRADES.join(", ")}`);
  return grade;
}

/** Battery health in percent: "" → null, "87" / "87%" → 87. Anything outside 0–100 throws. */
export function parseBatteryHealth(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/%$/, "");
  if (!text) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error(`Battery health "${raw}" must be 0–100`);
  return value;
}

// ───────────── scanning / pasting identifiers ─────────────

export type ParsedIdentifier = { imei: string | null; serialNumber: string | null };

export function identifierKey(unit: { imei: string | null; serialNumber: string | null }): string {
  return unit.imei ?? unit.serialNumber ?? "";
}

/**
 * One scanned value → identifier(s).
 *   15 digits with a correct check digit      → IMEI
 *   30, 45 … digits that are all valid IMEIs  → several IMEIs (scanner without Enter)
 *   5–40 letters and digits                   → serial number (iPad Wi-Fi, MacBook, AirPods …)
 * Throws with a readable message otherwise.
 */
export function parseIdentifierToken(token: string): ParsedIdentifier[] {
  const id = normalizeIdentifier(token);
  if (!id) return [];
  if (/^\d+$/.test(id)) {
    if (id.length === 15) {
      if (!luhnValid(id)) throw new Error(`${id} is not a valid IMEI (check digit is wrong)`);
      return [{ imei: id, serialNumber: null }];
    }
    if (id.length % 15 === 0) {
      const parts = id.match(/\d{15}/g) ?? [];
      if (parts.every(isValidImei)) return parts.map((imei) => ({ imei, serialNumber: null }));
    }
    throw new Error(`${id} has ${id.length} digits — an IMEI has 15 digits`);
  }
  if (isValidSerial(id)) return [{ imei: null, serialNumber: id }];
  throw new Error(`"${token.trim()}" is not an IMEI or serial number`);
}

/**
 * Splits scanned / pasted text into separate entries.
 * New lines, commas, semicolons and tabs always separate entries. Spaces separate entries too,
 * except inside one IMEI printed with spaces (e.g. "35 990000 000500 7" on a box label).
 */
export function splitIdentifierTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const segment of text.split(/[\r\n,;\t]+/)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    if (/\s/.test(trimmed) && !isValidImei(normalizeIdentifier(trimmed))) {
      tokens.push(...trimmed.split(/\s+/).filter(Boolean));
    } else {
      tokens.push(trimmed);
    }
  }
  return tokens;
}

export type IdentifierInput = {
  identifiers: ParsedIdentifier[];
  /** Readable problems (invalid values, duplicates) */
  errors: string[];
  /** The raw values that could not be read, so a form can leave them in the box to fix */
  invalidTokens: string[];
};

/** Parses a block of scanned / pasted IMEIs and serial numbers. Duplicates are reported once. */
export function parseIdentifierInput(text: string): IdentifierInput {
  const identifiers: ParsedIdentifier[] = [];
  const errors: string[] = [];
  const invalidTokens: string[] = [];
  const seen = new Set<string>();
  for (const token of splitIdentifierTokens(text)) {
    let parsed: ParsedIdentifier[];
    try {
      parsed = parseIdentifierToken(token);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      invalidTokens.push(token);
      continue;
    }
    for (const id of parsed) {
      const key = identifierKey(id);
      if (seen.has(key)) {
        errors.push(`${key} is entered twice`);
        continue;
      }
      seen.add(key);
      identifiers.push(id);
    }
  }
  return { identifiers, errors, invalidTokens };
}
