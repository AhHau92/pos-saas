import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute, readJson } from "@/lib/api/handler";
import {
  expiryFromNow,
  OUTLET_COOKIE,
  sessionCookieOptions,
  sessionTtlSeconds,
  signToken,
  TENANT_SESSION_COOKIE,
} from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseInput } from "@/lib/validation";
import { signInTenantUser } from "@/modules/tenant";

const schema = z.object({
  shopCode: z.string().trim().min(1, "Shop code is required").max(40),
  email: z.string().trim().min(1, "Email is required").max(120),
  password: z.string().min(1, "Password is required").max(200),
});

export const POST = publicRoute(async ({ req }) => {
  const data = parseInput(schema, await readJson(req));
  rateLimit(`login:${clientIp(req)}:${data.shopCode.toLowerCase()}:${data.email.toLowerCase()}`, {
    limit: 10,
    windowMs: 5 * 60_000,
  });
  const result = await signInTenantUser(data);
  const ttl = sessionTtlSeconds();
  const token = signToken({ k: "t", t: result.tenant.slug, u: result.userId, exp: expiryFromNow(ttl) });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(TENANT_SESSION_COOKIE, token, sessionCookieOptions(ttl));
  if (result.defaultOutletId) response.cookies.set(OUTLET_COOKIE, result.defaultOutletId, sessionCookieOptions(ttl));
  return response;
});
