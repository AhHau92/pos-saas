import { NextResponse } from "next/server";
import { getControlDb } from "@/lib/db/control";

/** Liveness / readiness probe for Docker and cloud load balancers. */
export async function GET(): Promise<Response> {
  try {
    await getControlDb().$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "up" });
  } catch {
    return NextResponse.json({ ok: false, database: "down" }, { status: 503 });
  }
}
