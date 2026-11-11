/**
 * Client-safe exports of the inventory module (no database code).
 * Client components import from "@/modules/inventory/client", never from "@/modules/inventory".
 */
export { normalizeIdentifier, isValidImei, parseUnitLine, parseUnitLines } from "./imei";
export type { ParsedUnit } from "./imei";
export { canTransition, UNIT_STATUSES, UNIT_STATUS_LABELS, UNIT_TRANSITIONS } from "./unit-state";
export type { UnitStatus } from "./unit-state";
export type { AvailableUnit, UnitListItem } from "./inventory.queries";

export const ADJUSTMENT_REASON_OPTIONS = [
  { value: "OPENING_STOCK", label: "Opening stock" },
  { value: "STOCK_COUNT", label: "Stock count" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "LOST", label: "Lost / stolen" },
  { value: "FOUND", label: "Found" },
  { value: "REPAIRED", label: "Repaired" },
  { value: "OTHER", label: "Other" },
] as const;
