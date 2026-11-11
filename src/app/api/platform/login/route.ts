import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute, readJson } from "@/lib/api/handler";
import { expiryFromNow, PLATFORM_SESSION_COOKIE, sessionCookieOptions, signToken } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseInput } from "@/lib/validation";
import { authenticatePlatformAdmin } from "@/modules/tenant";

const schema = z.object({ email: z.string().trim().min(1).max(120), password: z.string().min(1).max(200) });

export const POST = publicRoute(async ({ req }) => {
  const data = parseInput(schema, await readJson(req));
  rateLimit(`platform-login:${clientIp(req)}`, { limit: 10, windowMs: 5 * 60_000 });
  const admin = await authenticatePlatformAdmin(data.email, data.password);
  const ttl = 8 * 3600;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PLATFORM_SESSION_COOKIE, signToken({ k: "p", a: admin.id, exp: expiryFromNow(ttl) }), sessionCookieOptions(ttl));
  return response;
});
