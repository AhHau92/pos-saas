/**
 * Transfer status rules. Pure module (used by the service, the pages and the tests).
 * See docs/04-business-flows.md §2.
 *
 *   DRAFT ──dispatch──▶ IN_TRANSIT ──receive part──▶ PARTIALLY_RECEIVED ──receive rest──▶ RECEIVED
 *     │                    │                              │
 *     └──cancel──▶ CANCELLED ◀── everything returned ──────┤
 *                                                         └── some lost / returned ──▶ CLOSED
 */

export type TransferStatusValue = "DRAFT" | "IN_TRANSIT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELLED";

export const TRANSFER_STATUSES: readonly TransferStatusValue[] = [
  "DRAFT",
  "IN_TRANSIT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
  "CANCELLED",
];

/** Dispatched and not finished: something can still be received, written off or returned. */
export const OPEN_TRANSFER_STATUSES: readonly TransferStatusValue[] = ["IN_TRANSIT", "PARTIALLY_RECEIVED"];

export function isOpenTransfer(status: TransferStatusValue): boolean {
  return OPEN_TRANSFER_STATUSES.includes(status);
}

export const TRANSFER_STATUS_LABELS: Record<TransferStatusValue, string> = {
  DRAFT: "Draft",
  IN_TRANSIT: "In transit",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Received",
  CLOSED: "Closed with differences",
  CANCELLED: "Cancelled",
};

export type TransferItemCounts = {
  quantity: number;
  receivedQuantity: number;
  lostQuantity: number;
  returnedQuantity: number;
};

/** Still on the road: not received, not written off, not returned. */
export function outstandingQuantity(item: TransferItemCounts): number {
  return item.quantity - item.receivedQuantity - item.lostQuantity - item.returnedQuantity;
}

/** Status of a dispatched transfer after a receipt or a resolution. */
export function transferStatusAfter(items: TransferItemCounts[]): Exclude<TransferStatusValue, "DRAFT"> {
  let outstanding = 0;
  let received = 0;
  let lost = 0;
  let returned = 0;
  for (const item of items) {
    outstanding += outstandingQuantity(item);
    received += item.receivedQuantity;
    lost += item.lostQuantity;
    returned += item.returnedQuantity;
  }
  if (outstanding > 0) return received > 0 ? "PARTIALLY_RECEIVED" : "IN_TRANSIT";
  if (lost === 0 && returned === 0) return "RECEIVED";
  if (received === 0 && lost === 0) return "CANCELLED"; // everything went back to the sender
  return "CLOSED";
}
