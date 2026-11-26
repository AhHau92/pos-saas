import { searchParam, tenantRoute } from "@/lib/api/handler";
import { lookupTradeInDevice } from "@/modules/sales";

/** IMEI check before buying a device: ?identifier=<IMEI or serial> */
export const GET = tenantRoute(async ({ req, ctx }) => lookupTradeInDevice(ctx, searchParam(req, "identifier") ?? ""));
