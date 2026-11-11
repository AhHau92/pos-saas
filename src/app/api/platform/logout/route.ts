import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/api/handler";
import { PLATFORM_SESSION_COOKIE } from "@/lib/auth/session";

export const POST = publicRoute(async () => {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(PLATFORM_SESSION_COOKIE);
  return response;
});
