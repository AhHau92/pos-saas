/**
 * Email address and phone number helpers. Pure module — safe in client components.
 */

/** Simple, permissive email check (the mail server is the real judge). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

/** Trims and lowercases the domain part ("Jason@Example.COM" → "Jason@example.com"). */
export function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  return at < 0 ? trimmed : `${trimmed.slice(0, at)}@${trimmed.slice(at + 1).toLowerCase()}`;
}

/**
 * Phone number in the international digits-only format that WhatsApp links need.
 *   "+65 9123 4567" → "6591234567"     "9123 4567" → "6591234567" (country code added)
 *   "0065 9123 4567" → "6591234567"    "123" → null
 * Numbers with 8 digits or fewer are treated as local numbers.
 */
export function whatsappNumber(phone: string | null | undefined, countryCode = "65"): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.length <= 8) {
    digits = `${countryCode.replace(/\D/g, "")}${digits.replace(/^0+/, "")}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** Click-to-chat link: opens WhatsApp with the message filled in; staff press Send. Free, no API. */
export function whatsappLink(text: string, number: string | null): string {
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`;
}
