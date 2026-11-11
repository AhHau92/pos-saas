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
