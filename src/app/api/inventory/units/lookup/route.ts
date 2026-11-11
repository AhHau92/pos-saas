import { searchParam, tenantRoute } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { assertCan } from "@/lib/service-context";
import { findUnitByIdentifier } from "@/modules/inventory";
import { variantLabel } from "@/modules/products";

/** Exact IMEI / serial lookup (transfer & adjustment scanners). */
export const GET = tenantRoute(async ({ req, ctx }) => {
  assertCan(ctx, "inventory.view");
  const identifier = searchParam(req, "identifier");
  if (!identifier) throw new ValidationError("identifier is required");
  const unit = await findUnitByIdentifier(ctx.db, identifier);
  if (!unit) throw new NotFoundError(`${identifier} was not found`);
  return {
    id: unit.id,
    imei: unit.imei,
    serialNumber: unit.serialNumber,
    status: unit.status,
    outletId: unit.outletId,
    outletCode: unit.outlet.code,
    variantId: unit.variantId,
    sku: unit.variant.sku,
    label: variantLabel(unit.variant.product.name, unit.variant),
    costCents: unit.costCents,
  };
});
