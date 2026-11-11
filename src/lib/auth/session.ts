import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless signed session tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Stored in HttpOnly cookies. User status is re-checked on every request.
 */

export const TENANT_SESSION_COOKIE = "pos_session";
export const PLATFORM_SESSION_COOKIE = "pos_platform";
export const OUTLET_COOKIE = "pos_outlet";

export type TenantSessionPayload = { k: "t"; t: string; u: string; exp: number };
export type PlatformSessionPayload = { k: "p"; a: string; exp: number };

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return secret;
}

function sign(body: string): Buffer {
  return createHmac("sha256", sessionSecret()).update(body).digest();
}

export function signToken(payload: TenantSessionPayload | PlatformSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}

export function verifyToken<T extends { exp: number }>(token: string | null | undefined): T | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionTtlSeconds(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 12);
  return Math.max(1, Number.isFinite(hours) ? hours : 12) * 3600;
}

export function expiryFromNow(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

export function sessionCookieOptions(maxAge: number): SessionCookieOptions {
  const secure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production";
  return { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge };
}
