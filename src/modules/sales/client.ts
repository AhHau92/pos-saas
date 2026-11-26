/**
 * Client-safe exports of the sales module (no database code).
 * Client components import from "@/modules/sales/client", never from "@/modules/sales".
 */
export { priceLines, allocatePayments, refundAmountForLine, lineTax } from "./pricing";
export type { PricingLine, PricedLine, SaleTotals } from "./pricing";
export type { PosLookupResult, PosUnit } from "./pos-lookup";
export type { CustomerDTO } from "./customers.service";
export type { PaymentMethodDTO } from "./payment-methods.service";
export type { SaleDetail, SaleListItem, SaleStatusValue } from "./sales.queries";
export { receiptTitle, receiptText, formatTaxRate, maskPhone, maskEmail } from "./receipt";
export type { ReceiptData, ReceiptHeader } from "./receipt";
export type { ReceiptShare } from "./receipt.service";
export {
  SELLER_ID_TYPES,
  SELLER_ID_LABELS,
  TRADE_IN_CHECKS,
  maskIdNumber,
  missingRequiredChecks,
  tradeInTotal,
} from "./tradein";
export type { SellerIdType, TradeInChecklist, TradeInCheckKey } from "./tradein";
export type { TradeInDeviceLookup } from "./tradein.service";
export type { TradeInListItem, TradeInDetail } from "./tradein.queries";
