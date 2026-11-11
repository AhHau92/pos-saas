import { NextResponse } from "next/server";
import { getPlatformAdmin, getTenantContext, type TenantContext } from "@/lib/auth/context";
import { AppError, ValidationError, isPrismaError } from "@/lib/errors";
import type { PlatformAdminDTO } from "@/modules/tenant";

/**
 * Route handler wrappers. Route files stay thin:
 *
 *   export const POST = tenantRoute(async ({ req, ctx }) => createThing(ctx, await readJson(req)));
 *
 * - authentication (tenant user / platform admin)
 * - JSON response (return a value, or a Response for full control)
 * - error mapping (AppError → status code, unexpected → 500)
 */

type Segment<P> = { params: Promise<P> };

export function jsonError(status: number, code: string, message: string, details?: unknown): Response {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) return jsonError(error.status, error.code, error.message, error.details);
  if (isPrismaError(error, "P2002")) return jsonError(409, "DUPLICATE", "A record with the same value already exists");
  if (isPrismaError(error, "P2025")) return jsonError(404, "NOT_FOUND", "Record not found");
  console.error("[api] unexpected error", error);
  return jsonError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}

/** Reads a JSON body. Requires Content-Type: application/json (CSRF protection together with SameSite cookies). */
export async function readJson(req: Request): Promise<unknown> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json");
  }
  try {
    return await req.json();
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
}

function toResponse(result: unknown): Response {
  if (result instanceof Response) return result;
  return NextResponse.json(result === undefined ? { ok: true } : result);
}

async function resolveParams<P>(segment: Segment<P> | undefined): Promise<P> {
  return segment?.params ? await segment.params : ({} as P);
}

export function tenantRoute<P = {}>(
  handler: (args: { req: Request; ctx: TenantContext; params: P }) => Promise<unknown>,
) {
  return async (req: Request, segment: Segment<P>): Promise<Response> => {
    try {
      const ctx = await getTenantContext();
      if (!ctx) return jsonError(401, "UNAUTHORIZED", "Please sign in again");
      return toResponse(await handler({ req, ctx, params: await resolveParams(segment) }));
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export function platformRoute<P = {}>(
  handler: (args: { req: Request; admin: PlatformAdminDTO; params: P }) => Promise<unknown>,
) {
  return async (req: Request, segment: Segment<P>): Promise<Response> => {
    try {
      const admin = await getPlatformAdmin();
      if (!admin) return jsonError(401, "UNAUTHORIZED", "Please sign in again");
      return toResponse(await handler({ req, admin, params: await resolveParams(segment) }));
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** No authentication (login endpoints). */
export function publicRoute<P = {}>(handler: (args: { req: Request; params: P }) => Promise<unknown>) {
  return async (req: Request, segment: Segment<P>): Promise<Response> => {
    try {
      return toResponse(await handler({ req, params: await resolveParams(segment) }));
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Reads ?key= from the request URL. */
export function searchParam(req: Request, key: string): string | undefined {
  const value = new URL(req.url).searchParams.get(key);
  return value === null || value === "" ? undefined : value;
}

/** Reads ?key= and accepts it only if it is one of `allowed`. */
export function enumParam<T extends string>(req: Request, key: string, allowed: readonly T[]): T | undefined {
  const value = searchParam(req, key);
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Reads ?key= as an integer clamped to [min, max]. */
export function intParam(req: Request, key: string, fallback: number, min: number, max: number): number {
  const value = Number(searchParam(req, key));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
