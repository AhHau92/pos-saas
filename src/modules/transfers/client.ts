/**
 * Client-safe exports of the transfers module (no database code).
 * Client components import from "@/modules/transfers/client", never from "@/modules/transfers".
 */
export {
  TRANSFER_STATUSES,
  TRANSFER_STATUS_LABELS,
  isOpenTransfer,
  outstandingQuantity,
} from "./transfer-status";
export type { TransferStatusValue, TransferItemCounts } from "./transfer-status";
export type { TransferDetail, TransferListItem, ReturnableItems } from "./transfers.queries";
