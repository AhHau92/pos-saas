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

export type ParsedUnit = {
  imei: string | null;
  serialNumber: string | null;
  grade: string | null;
  batteryHealth: number | null;
};

/**
 * Parses one scanned line: "IDENTIFIER[,GRADE][,BATTERY%]"
 *   356789012345678          → IMEI
 *   356789012345678,A,87     → used phone, grade A, battery 87%
 *   C02XK1JHJG5J             → serial number (laptops, Wi-Fi iPads)
 */
export function parseUnitLine(line: string): ParsedUnit {
  const [rawId = "", rawGrade = "", rawBattery = ""] = line.split(/[,\t;]/).map((s) => s.trim());
  const id = normalizeIdentifier(rawId);
  if (!id) throw new Error("Empty line");

  let imei: string | null = null;
  let serialNumber: string | null = null;
  if (looksLikeImei(id)) {
    if (!isValidImei(id)) throw new Error(`${id} is not a valid IMEI (15 digits, check digit failed)`);
    imei = id;
  } else if (isValidSerial(id)) {
    serialNumber = id;
  } else {
    throw new Error(`${rawId} is not a valid IMEI or serial number`);
  }

  const grade = rawGrade ? rawGrade.toUpperCase().slice(0, 5) : null;
  let batteryHealth: number | null = null;
  if (rawBattery) {
    const n = Number(rawBattery.replace("%", ""));
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(`Battery health for ${id} must be 0–100`);
    batteryHealth = n;
  }
  return { imei, serialNumber, grade, batteryHealth };
}

/** Parses a textarea of scanned units (one per line), collecting errors and duplicates. */
export function parseUnitLines(text: string): { units: ParsedUnit[]; errors: string[] } {
  const units: ParsedUnit[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      try {
        const unit = parseUnitLine(line);
        const key = unit.imei ?? unit.serialNumber ?? "";
        if (seen.has(key)) {
          errors.push(`Line ${index + 1}: ${key} is duplicated`);
          return;
        }
        seen.add(key);
        units.push(unit);
      } catch (error) {
        errors.push(`Line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  return { units, errors };
}
