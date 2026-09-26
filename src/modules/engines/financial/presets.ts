import type { FinancialInputs, FinancingInstrument } from "./types";

/**
 * Convenience builders used by strategies and tests. They produce complete,
 * explicit inputs; nothing here is a hidden assumption — every value is later
 * visible to the user as an Assumption.
 */
export function baseSaleInputs(
  overrides: Partial<{
    purchasePrice: number;
    renovationBudget: number;
    salePrice: number;
    durationMonths: number;
    worksMonths: number;
    assetUse: FinancialInputs["acquisition"]["assetUse"];
    transferTaxMode: FinancialInputs["acquisition"]["transferTaxMode"];
    financing: FinancingInstrument[];
    professionalFees: number;
    annualPropertyTax: number;
    monthlyCommunityFees: number;
    agencyRate: number;
    sellerProfile: "individual" | "company";
    analysisDate: string;
  }> = {},
): FinancialInputs {
  const purchasePrice = overrides.purchasePrice ?? 200_000;
  const renovationBudget = overrides.renovationBudget ?? 40_000;
  return {
    analysisDate: overrides.analysisDate ?? "2026-01-15",
    jurisdiction: { country: "ES", region: "AND", municipalityCode: "41091" },
    acquisition: {
      purchasePrice,
      transferTaxMode: overrides.transferTaxMode ?? "ITP",
      assetUse: overrides.assetUse ?? "residential",
      agencyFee: 0,
      dueDiligence: 600,
    },
    transformation: {
      renovationBudget,
      contingencyRate: 0.1,
      professionalFees: overrides.professionalFees ?? Math.round(renovationBudget * 0.08),
      otherLicenceCosts: 0,
      worksMonths: overrides.worksMonths ?? 4,
      worksVatReduced: false,
    },
    holding: {
      durationMonths: overrides.durationMonths ?? 9,
      monthlyCommunityFees: overrides.monthlyCommunityFees ?? 60,
      monthlyInsurance: 25,
      monthlyUtilities: 60,
      annualPropertyTax: overrides.annualPropertyTax ?? 450,
      otherMonthly: 0,
    },
    financing: overrides.financing ?? [],
    exit: {
      kind: "sale",
      salePrice: overrides.salePrice ?? 310_000,
      agencyRate: overrides.agencyRate ?? 0.03,
      otherSaleCosts: 800,
      sellerProfile: overrides.sellerProfile ?? "individual",
      plusvaliaMunicipal: null,
    },
  };
}

export function mortgage(ratio: number, annualRate = 0.035, termMonths = 300): FinancingInstrument {
  return {
    kind: "mortgage",
    label: "Hipoteca",
    sizing: { type: "ltv", ratio },
    annualRate,
    termMonths,
    interestOnly: false,
    arrangementFeeRate: 0.005,
    drawMonth: 0,
  };
}

export function bridgeLoan(ratio: number, annualRate = 0.09): FinancingInstrument {
  return {
    kind: "bridge",
    label: "Préstamo puente",
    sizing: { type: "ltc", ratio },
    annualRate,
    termMonths: 12,
    interestOnly: true,
    arrangementFeeRate: 0.02,
    drawMonth: 0,
  };
}
