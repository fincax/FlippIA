import type { EvidenceStatus } from "@/modules/core/evidence-status";
import type { TransferTaxMode } from "@/modules/tax";

export type AssetUse = "residential" | "commercial" | "office" | "industrial" | "land" | "other";
export type SellerProfile = "individual" | "company";

export interface AcquisitionInputs {
  purchasePrice: number;
  transferTaxMode: TransferTaxMode;
  assetUse: AssetUse;
  /** Buyer-side agency fee, absolute. */
  agencyFee: number;
  /** Technical inspection, legal due diligence, valuation. */
  dueDiligence: number;
  /**
   * Taxable base of the transfer tax when it is not the price (reference
   * value, professional settlement). Absent → the price.
   */
  taxableBase?: number;
  /**
   * Transfer tax (ITP or IVA) settled or confirmed by a professional. Replaces
   * the rule-based amount; the rule-based estimate stays in the tax component.
   */
  transferTaxManual?: number;
}

/**
 * Tax treatment the engine cannot decide by itself. Absent fields mean
 * UNKNOWN: input VAT is then treated as a cost and flagged for review, never
 * assumed recoverable.
 */
export interface TaxInputs {
  /** Share of input VAT (works, new-build purchase) the project recovers: 0..1. */
  vatRecoverabilityRatio?: number;
}

export interface TransformationInputs {
  /** Material execution budget of the works (PEM), before VAT. */
  renovationBudget: number;
  contingencyRate: number;
  /** Architect, project, site management, certificates. */
  professionalFees: number;
  /** Extra licence-related costs beyond ICIO + tasa (e.g. reports). */
  otherLicenceCosts: number;
  /** Months of works, starting after acquisition. */
  worksMonths: number;
  /** Apply reduced VAT on works (residential rehab meeting requirements). REVIEW_REQUIRED. */
  worksVatReduced: boolean;
}

export interface HoldingInputs {
  /** Total months from acquisition to exit (sale) or to end of hold (rent). */
  durationMonths: number;
  monthlyCommunityFees: number;
  monthlyInsurance: number;
  monthlyUtilities: number;
  annualPropertyTax: number; // IBI
  otherMonthly: number;
}

export type FinancingKind =
  | "equity"
  | "mortgage"
  | "bridge"
  | "acquisition_loan"
  | "renovation_facility"
  | "private_debt"
  | "partner_equity"
  | "co_investment";

export interface FinancingInstrument {
  kind: Exclude<FinancingKind, "equity">;
  label: string;
  /** Sizing: absolute amount or ratio over purchase price (LTV) / over total cost (LTC). */
  sizing:
    { type: "amount"; amount: number } | { type: "ltv"; ratio: number } | { type: "ltc"; ratio: number };
  annualRate: number;
  /** Amortization term. Interest-only instruments ignore it except for the bullet at exit. */
  termMonths: number;
  interestOnly: boolean;
  arrangementFeeRate: number;
  /** Month in which funds are drawn (0 = at acquisition). */
  drawMonth: number;
  /** For partner equity / co-investment: share of net profit paid to the partner instead of interest. */
  profitShare?: number;
}

export interface SaleExit {
  kind: "sale";
  salePrice: number;
  agencyRate: number;
  otherSaleCosts: number;
  sellerProfile: SellerProfile;
  /** Municipal capital gains tax, if known. null → unknown, flagged. */
  plusvaliaMunicipal: number | null;
}

export interface RentExit {
  kind: "rent";
  monthlyRent: number;
  vacancyRate: number;
  /** Maintenance + management as share of gross rent. */
  opexRate: number;
  /** Rent starts after works complete. */
  /** Terminal value assumption at the end of the hold, for IRR. */
  terminalValue: number;
  terminalAgencyRate: number;
  sellerProfile: SellerProfile;
}

export type ExitInputs = SaleExit | RentExit;

export interface FinancialInputs {
  acquisition: AcquisitionInputs;
  transformation: TransformationInputs;
  holding: HoldingInputs;
  financing: FinancingInstrument[];
  exit: ExitInputs;
  tax?: TaxInputs;
  /** Analysis date, used to resolve tax rules. */
  analysisDate: string;
  jurisdiction: { country: string; region?: string; municipalityCode?: string };
}

export type CostCategory =
  | "purchase"
  | "acquisition_taxes"
  | "notary"
  | "registry"
  | "agency"
  | "professional_fees"
  | "architecture"
  | "licences"
  | "construction"
  | "contingency"
  | "financing_fees"
  | "interest"
  | "holding"
  | "community"
  | "insurance"
  | "utilities"
  | "taxes"
  | "marketing"
  | "sales_costs"
  | "exit_taxes"
  | "other";

export interface CostLine {
  key: string;
  category: CostCategory;
  label: string;
  amount: number;
  /** Where the number came from. */
  origin: "input" | "rule" | "computed";
  ruleRef?: string;
  note?: string;
}

export interface MetricValue {
  key: MetricKey;
  value: number | null;
  unit: "currency" | "ratio" | "months" | "number";
  formula: string;
  explanation: string;
  inputs: Record<string, number | null>;
}

export type MetricKey =
  | "totalProjectCost"
  | "totalCashOut"
  | "equityRequired"
  | "debt"
  | "ltv"
  | "ltc"
  | "grossProfit"
  | "netProfit"
  | "netProfitAfterTax"
  | "margin"
  | "roi"
  | "roe"
  | "annualizedRoe"
  | "irr"
  | "cashOnCash"
  | "capRate"
  | "grossYield"
  | "netYield"
  | "dscr"
  | "breakEvenPrice"
  | "breakEvenRent"
  | "durationMonths"
  | "effectiveProjectCost"
  | "recoverableTax";

export type TaxComponentType = "ITP" | "IVA" | "AJD" | "ICIO" | "TASA" | "IBI" | "IRPF" | "IS" | "IIVTNU";
export type TaxSettlement =
  "normal" | "reverse_charge" | "exempt" | "not_subject" | "manual_review" | "unknown";
export type TaxRecoverability = "full" | "partial" | "none" | "unknown";

/** One tax, with its base, rule, recoverability and provenance. Never hidden inside a price. */
export interface TaxComponent {
  key: string;
  type: TaxComponentType;
  label: string;
  /** Concept the tax belongs to (`acquisition`, `construction`, `exit`…). */
  concept: string;
  taxableBase: number;
  rate?: number;
  amount: number;
  recoverableAmount: number;
  nonRecoverableAmount: number;
  recoverability: TaxRecoverability;
  settlement: TaxSettlement;
  source: "rule" | "professional" | "input";
  ruleRef?: string;
  status: EvidenceStatus;
  /** Rule-based amount when a professional figure replaced it. */
  estimatedAmount?: number;
  note?: string;
}

/**
 * A concept of the project seen four ways: base (before indirect taxes),
 * gross (what is invoiced or paid), effective cost (what the project really
 * bears) and cash requirement (what has to be financed).
 */
export interface ConceptBreakdown {
  key: "acquisition" | "construction" | "professional_fees" | "sale_costs";
  label: string;
  base: number;
  taxAmount: number;
  gross: number;
  recoverableTax: number;
  effectiveCost: number;
  cashRequirement: number;
  /** Worst status among the concept's tax components; UNKNOWN when none is resolved. */
  taxStatus: EvidenceStatus;
  componentKeys: string[];
  note?: string;
}

export interface TaxSummary {
  components: TaxComponent[];
  concepts: ConceptBreakdown[];
  /** Input VAT the project recovers (works, new-build purchase) under the stated recoverability. */
  recoverableTotal: number;
  nonRecoverableTotal: number;
  /** totalProjectCost − recoverableTotal. */
  effectiveProjectCost: number;
  /** Gross cash the project must fund before any recovery: totalProjectCost. */
  cashRequirement: number;
  vatRecoverability: {
    ratio: number;
    recoverability: TaxRecoverability;
    status: EvidenceStatus;
    note: string;
  };
}

export interface CashflowPoint {
  month: number;
  inflow: number;
  outflow: number;
  /** Part of `inflow` that is financing (debt draws, partner capital). */
  funding: number;
  net: number;
  cumulative: number;
  label?: string;
}

export interface FinancingSummary {
  instruments: Array<{
    label: string;
    kind: FinancingInstrument["kind"];
    principal: number;
    arrangementFee: number;
    interest: number;
    totalCost: number;
    outstandingAtExit: number;
    profitShare: number;
  }>;
  totalDebt: number;
  totalFinancingCost: number;
}

export interface FinancialResult {
  inputs: FinancialInputs;
  taxRuleSetId: string;
  costLines: CostLine[];
  totals: {
    purchase: number;
    acquisitionCosts: number;
    transformation: number;
    holding: number;
    financing: number;
    saleCosts: number;
    exitTaxes: number;
    totalProjectCost: number;
    totalCashOut: number;
  };
  financing: FinancingSummary;
  cashflows: CashflowPoint[];
  metrics: Record<MetricKey, MetricValue>;
  /** Taxes separated from prices: components, concepts, recoverable VAT, effective cost vs cash. */
  tax: TaxSummary;
  warnings: string[];
  /** Items that need a human/professional check to become VERIFIED. */
  reviewItems: string[];
}
