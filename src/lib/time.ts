/**
 * Business-timezone helpers (no external date library).
 * The business timezone comes from the TZ env var (default Asia/Singapore).
 */

export const DEFAULT_TIME_ZONE = "Asia/Singapore";

export function businessTimeZone(): string {
  const tz = typeof process !== "undefined" ? process.env.TZ : undefined;
  return tz && tz.trim() !== "" ? tz : DEFAULT_TIME_ZONE;
}

/** Offset of `timeZone` from UTC at `date`, in minutes (Singapore = +480). */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Start of the calendar day containing `date`, in `timeZone`, as a UTC instant. */
export function startOfDay(date: Date, timeZone: string = businessTimeZone()): Date {
  const offset = timeZoneOffsetMinutes(date, timeZone);
  const local = new Date(date.getTime() + offset * 60000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset * 60000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function yearInTimeZone(date: Date, timeZone: string = businessTimeZone()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(date));
}

export function formatDateTime(value: Date | string, timeZone?: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone ?? businessTimeZone(),
  }).format(date);
}

export function formatDate(value: Date | string, timeZone?: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: timeZone ?? businessTimeZone() }).format(date);
}

/** "2026-11-11" in the business timezone (for <input type="date"> defaults). */
export function toDateInputValue(date: Date, timeZone: string = businessTimeZone()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Parses "2026-11-11" as midnight in the business timezone. */
export function parseDateInput(value: string, timeZone: string = businessTimeZone()): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  const offset = timeZoneOffsetMinutes(utcMidnight, timeZone);
  return new Date(utcMidnight.getTime() - offset * 60000);
}
