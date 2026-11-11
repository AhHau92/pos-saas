// Write side — call ONLY inside the caller's transaction (tx)
export {
  receiveStock,
  issueStock,
  returnStock,
  receiveTransferredStock,
  changeUnitStatus,
  type DocumentRef,
  type IncomingUnit,
  type IssuedStock,
  type UnitAction,
} from "./stock.service";
export {
  createAdjustment,
  incomingUnitSchema,
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  type AdjustmentReasonValue,
} from "./adjustments.service";
// Read side
export {
  getStockMatrix,
  listLowStock,
  searchUnits,
  findUnitByIdentifier,
  listAvailableUnits,
  getUnitDetail,
  listMovements,
  listAdjustments,
  type StockMatrix,
  type StockMatrixRow,
  type LowStockItem,
  type UnitListItem,
  type AvailableUnit,
  type UnitDetail,
  type UnitHistoryEvent,
  type MovementListItem,
  type AdjustmentListItem,
} from "./inventory.queries";
// Pure helpers
export { normalizeIdentifier, isValidImei, parseUnitLine, parseUnitLines, type ParsedUnit } from "./imei";
export {
  canTransition,
  UNIT_STATUSES,
  UNIT_STATUS_LABELS,
  UNIT_TRANSITIONS,
  type UnitStatus,
} from "./unit-state";
