/**
 * Which tax rules apply at an outlet. Pure module (used by checkout, the POS screen and tests).
 * See docs/04-business-flows.md §7.
 *
 * GST is registered per legal entity (company). An outlet trades as one company:
 *   - GST-registered company  → the business profile's rate (e.g. 9% GST), tax invoice with GST reg no.
 *   - not registered          → no GST at all (rate 0, plain receipt, no GST reg no.)
 *   - outlet without company  → the business profile's own details (single-company shops)
 */

export type TaxProfileInput = {
  name: string;
  registrationNo: string | null;
  taxRegistrationNo: string | null;
  taxRateBps: number;
  taxInclusive: boolean;
};

export type CompanyInput = {
  name: string;
  registrationNo: string | null;
  gstRegistered: boolean;
  taxRegistrationNo: string | null;
} | null;

export type OutletTax = {
  /** Legal name printed under the brand, when the outlet has its own company */
  legalName: string | null;
  registrationNo: string | null;
  /** Null when not GST-registered */
  taxRegistrationNo: string | null;
  gstRegistered: boolean;
  taxRateBps: number;
  taxInclusive: boolean;
};

export function effectiveTax(profile: TaxProfileInput, company: CompanyInput): OutletTax {
  if (!company) {
    return {
      legalName: null,
      registrationNo: profile.registrationNo,
      taxRegistrationNo: profile.taxRegistrationNo,
      gstRegistered: profile.taxRateBps > 0,
      taxRateBps: profile.taxRateBps,
      taxInclusive: profile.taxInclusive,
    };
  }
  return {
    legalName: company.name,
    registrationNo: company.registrationNo,
    taxRegistrationNo: company.gstRegistered ? company.taxRegistrationNo : null,
    gstRegistered: company.gstRegistered,
    taxRateBps: company.gstRegistered ? profile.taxRateBps : 0,
    taxInclusive: profile.taxInclusive,
  };
}
