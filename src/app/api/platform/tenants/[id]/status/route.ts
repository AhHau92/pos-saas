import { z } from "zod";
import { platformRoute, readJson } from "@/lib/api/handler";
import { parseInput } from "@/lib/validation";
import { setTenantStatus } from "@/modules/tenant";

export const POST = platformRoute<{ id: string }>(async ({ req, params }) => {
  const { status } = parseInput(z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }), await readJson(req));
  await setTenantStatus(params.id, status);
  return { ok: true };
});
