import { AppError } from "@/lib/errors";

/**
 * Minimal in-memory fixed-window rate limiter (per server process).
 * Good enough for login brute-force protection on a single instance;
 * move to Redis when running several app instances.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, options: { limit: number; windowMs: number }): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return;
  }
  bucket.count += 1;
  if (bucket.count > options.limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new AppError(429, "TOO_MANY_REQUESTS", `Too many attempts. Please try again in ${seconds} seconds.`);
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
