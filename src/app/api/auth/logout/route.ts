import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/api/handler";
import { OUTLET_COOKIE, TENANT_SESSION_COOKIE } from "@/lib/auth/session";

export const POST = publicRoute(async () => {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(TENANT_SESSION_COOKIE);
  response.cookies.delete(OUTLET_COOKIE);
  return response;
});
