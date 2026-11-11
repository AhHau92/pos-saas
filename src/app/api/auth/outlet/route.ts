import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, tenantRoute } from "@/lib/api/handler";
import { OUTLET_COOKIE, sessionCookieOptions, sessionTtlSeconds } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/errors";
import { idSchema, parseInput } from "@/lib/validation";

/** Switch the "current outlet" (owners / managers). */
export const POST = tenantRoute(async ({ req, ctx }) => {
  const { outletId } = parseInput(z.object({ outletId: idSchema }), await readJson(req));
  if (!ctx.outlets.some((o) => o.id === outletId)) throw new ForbiddenError("You cannot work at this outlet");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OUTLET_COOKIE, outletId, sessionCookieOptions(sessionTtlSeconds()));
  return response;
});
