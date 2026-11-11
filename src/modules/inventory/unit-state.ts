/**
 * IMEI / serial unit state machine. See docs/03-inventory-states.md.
 * Pure module (also used by the UI for labels).
 */

export type UnitStatus = "IN_STOCK" | "IN_TRANSIT" | "SOLD" | "DEFECTIVE" | "WRITTEN_OFF";

export const UNIT_STATUSES: readonly UnitStatus[] = ["IN_STOCK", "IN_TRANSIT", "SOLD", "DEFECTIVE", "WRITTEN_OFF"];

/** Allowed transitions: from → to[] */
export const UNIT_TRANSITIONS: Record<UnitStatus, readonly UnitStatus[]> = {
  IN_STOCK: ["IN_TRANSIT", "SOLD", "DEFECTIVE", "WRITTEN_OFF"],
  IN_TRANSIT: ["IN_STOCK"],
  SOLD: ["IN_STOCK", "DEFECTIVE"],
  DEFECTIVE: ["IN_STOCK", "WRITTEN_OFF"],
  WRITTEN_OFF: ["IN_STOCK"],
};

export function canTransition(from: UnitStatus, to: UnitStatus): boolean {
  return UNIT_TRANSITIONS[from].includes(to);
}

/** Counts as sellable on-hand stock (StockLevel) */
export function isSellable(status: UnitStatus): boolean {
  return status === "IN_STOCK";
}

/** Units that may be bought back / re-received under the same IMEI */
export function canBeReacquired(status: UnitStatus): boolean {
  return status === "SOLD" || status === "WRITTEN_OFF";
}

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  IN_STOCK: "In stock",
  IN_TRANSIT: "In transit",
  SOLD: "Sold",
  DEFECTIVE: "Defective",
  WRITTEN_OFF: "Written off",
};
