export { checkout } from "./checkout.service";
export { refundSale } from "./refund.service";
export {
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  seedDefaultPaymentMethods,
  DEFAULT_PAYMENT_METHODS,
  type PaymentMethodDTO,
} from "./payment-methods.service";
export { searchCustomers, createCustomer, normalizePhone, type CustomerDTO } from "./customers.service";
export { posLookup, type PosLookupResult, type PosUnit } from "./pos-lookup";
export {
  listSales,
  getSaleDetail,
  type SaleListItem,
  type SaleDetail,
  type SaleStatusValue,
} from "./sales.queries";
export {
  priceLines,
  allocatePayments,
  refundAmountForLine,
  lineTax,
  type PricingLine,
  type PricedLine,
  type SaleTotals,
} from "./pricing";
// Receipts (printed, e-receipt page, email, WhatsApp)
export {
  buildReceiptHeader,
  parseReceiptHeader,
  receiptTitle,
  receiptText,
  formatTaxRate,
  maskPhone,
  maskEmail,
  type ReceiptHeader,
  type ReceiptData,
} from "./receipt";
export { getReceiptData, getReceiptDataByToken } from "./receipt.queries";
export {
  ensureReceiptToken,
  recordReceiptPrint,
  getReceiptShare,
  emailReceipt,
  type ReceiptShare,
} from "./receipt.service";
export { receiptEmailHtml, receiptEmailText, receiptEmailSubject } from "./receipt-email";
// Trade-ins (buy-back and trade-in towards a sale)
export { createBuyBack, lookupTradeInDevice, recordTradeIn, tradeInInputSchema, type TradeInDeviceLookup } from "./tradein.service";
export { listTradeIns, getTradeInDetail, type TradeInListItem, type TradeInDetail } from "./tradein.queries";
export {
  SELLER_ID_TYPES,
  SELLER_ID_LABELS,
  TRADE_IN_CHECKS,
  maskIdNumber,
  sellerDeclaration,
  tradeInTotal,
  type SellerIdType,
  type TradeInChecklist,
} from "./tradein";
export { ensureTradeInPaymentMethod } from "./payment-methods.service";
