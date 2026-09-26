import { round2 } from "@/modules/core/math";
import type { FeeScaleStep, TaxBracket, TaxRuleSet } from "./types";

/** Apply a stepped fee scale (first step fixed, next steps marginal). */
export function applyFeeScale(value: number, scale: FeeScaleStep[]): number {
  let total = 0;
  let prev = 0;
  for (const step of scale) {
    if (value <= prev) break;
    const upper = Math.min(value, step.upTo);
    if (step.fixed !== undefined) total += step.fixed;
    else if (step.marginalRate !== undefined) total += (upper - prev) * step.marginalRate;
    prev = step.upTo;
  }
  return round2(total);
}

/** Progressive tax over brackets. */
export function applyBrackets(base: number, brackets: TaxBracket[]): number {
  if (base <= 0) return 0;
  let total = 0;
  let prev = 0;
  for (const b of brackets) {
    if (base <= prev) break;
    const upper = Math.min(base, b.upTo);
    total += (upper - prev) * b.rate;
    prev = b.upTo;
  }
  return round2(total);
}

export type TransferTaxMode = "ITP" | "IVA_AJD";

export interface AcquisitionTaxResult {
  mode: TransferTaxMode;
  transferTax: number; // ITP or IVA
  ajd: number;
  notary: number;
  registry: number;
  total: number;
  ruleSetId: string;
}

export function computeAcquisitionTaxes(
  price: number,
  mode: TransferTaxMode,
  rules: TaxRuleSet,
  opts: { assetUse?: "residential" | "commercial" | "other" } = {},
): AcquisitionTaxResult {
  const notary = applyFeeScale(price, rules.acquisition.notaryScale);
  const registry = applyFeeScale(price, rules.acquisition.registryScale);
  if (mode === "ITP") {
    const transferTax = round2(price * rules.acquisition.itpRate);
    return {
      mode,
      transferTax,
      ajd: 0,
      notary,
      registry,
      total: round2(transferTax + notary + registry),
      ruleSetId: rules.id,
    };
  }
  const ivaRate =
    opts.assetUse === "commercial" || opts.assetUse === "other"
      ? rules.acquisition.ivaCommercial
      : rules.acquisition.ivaResidentialNew;
  const transferTax = round2(price * ivaRate);
  const ajd = round2(price * rules.acquisition.ajdRate);
  return {
    mode,
    transferTax,
    ajd,
    notary,
    registry,
    total: round2(transferTax + ajd + notary + registry),
    ruleSetId: rules.id,
  };
}

export interface ExitTaxResult {
  taxableGain: number;
  incomeTax: number; // IRPF (individual) or IS (company)
  sellerProfile: "individual" | "company";
  plusvaliaMunicipal: number | null; // null = unknown, requires cadastral data
  total: number;
  ruleSetId: string;
}

export function computeExitTaxes(
  gain: number,
  sellerProfile: "individual" | "company",
  rules: TaxRuleSet,
  plusvaliaMunicipal: number | null = null,
): ExitTaxResult {
  const taxableGain = Math.max(0, gain);
  const incomeTax =
    sellerProfile === "individual"
      ? applyBrackets(taxableGain, rules.exit.capitalGainsIndividual)
      : round2(taxableGain * rules.exit.corporateTaxRate);
  return {
    taxableGain: round2(taxableGain),
    incomeTax,
    sellerProfile,
    plusvaliaMunicipal,
    total: round2(incomeTax + (plusvaliaMunicipal ?? 0)),
    ruleSetId: rules.id,
  };
}

export function computeWorksTaxes(
  materialBudget: number,
  rules: TaxRuleSet,
): { icio: number; licenceFee: number; total: number } {
  const icio = round2(materialBudget * rules.works.icioRate);
  const licenceFee = round2(materialBudget * rules.works.licenceFeeRate);
  return { icio, licenceFee, total: round2(icio + licenceFee) };
}
