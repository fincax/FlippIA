import { describe, expect, it } from "vitest";
import { computeFinancials, type FinancialInputs } from "./index";
import { FinancialEngineError } from "./engine";

/** Flip in Sevilla: second-hand flat (ITP), integral works, sale. */
function flip(over: Partial<FinancialInputs> = {}): FinancialInputs {
  return {
    analysisDate: "2026-01-15",
    jurisdiction: { country: "ES", region: "AND", municipalityCode: "41091" },
    acquisition: {
      purchasePrice: 200_000,
      transferTaxMode: "ITP",
      assetUse: "residential",
      agencyFee: 0,
      dueDiligence: 600,
    },
    transformation: {
      renovationBudget: 50_000,
      contingencyRate: 0.1,
      professionalFees: 4_000,
      otherLicenceCosts: 0,
      worksMonths: 4,
      worksVatReduced: false,
    },
    holding: {
      durationMonths: 9,
      monthlyCommunityFees: 60,
      monthlyInsurance: 25,
      monthlyUtilities: 50,
      annualPropertyTax: 400,
      otherMonthly: 0,
    },
    financing: [],
    exit: {
      kind: "sale",
      salePrice: 330_000,
      agencyRate: 0.03,
      otherSaleCosts: 800,
      sellerProfile: "individual",
      plusvaliaMunicipal: null,
    },
    ...over,
  };
}

const line = (r: ReturnType<typeof computeFinancials>, key: string) =>
  r.costLines.find((l) => l.key === key)?.amount ?? 0;
const comp = (r: ReturnType<typeof computeFinancials>, key: string) =>
  r.tax.components.find((c) => c.key === key)!;

describe("tax layer — taxes separated, recoverability never assumed", () => {
  it("legacy inputs (no tax treatment) keep every figure: VAT is a cost, flagged for review", () => {
    const r = computeFinancials(flip());
    const worksVat = comp(r, "construction_vat");
    expect(worksVat.amount).toBe(10_500);
    expect(worksVat.taxableBase).toBe(50_000);
    expect(worksVat.rate).toBe(0.21);
    expect(worksVat.recoverability).toBe("unknown");
    expect(worksVat.recoverableAmount).toBe(0);
    expect(worksVat.nonRecoverableAmount).toBe(10_500);
    expect(r.tax.vatRecoverability).toMatchObject({
      ratio: 0,
      recoverability: "unknown",
      status: "REVIEW_REQUIRED",
    });
    expect(r.tax.recoverableTotal).toBe(0);
    expect(r.tax.effectiveProjectCost).toBe(r.totals.totalProjectCost);
    expect(r.tax.cashRequirement).toBe(r.totals.totalProjectCost);
    expect(r.metrics.effectiveProjectCost.value).toBe(r.totals.totalProjectCost);
    expect(r.metrics.netProfit.value).toBeCloseTo(
      330_000 - (330_000 * 0.03 + 800) - r.totals.totalProjectCost,
      1,
    );
    expect(r.metrics.roi.value).toBeCloseTo((r.metrics.netProfit.value ?? 0) / r.totals.totalProjectCost, 4);
    expect(r.reviewItems.some((i) => i.includes("Deducibilidad del IVA"))).toBe(true);
    expect(r.cashflows.some((c) => c.label?.includes("Recuperación de IVA"))).toBe(false);
  });

  it("ITP is never recoverable, even with full VAT recoverability; ICIO and the licence fee are not VAT", () => {
    const r = computeFinancials(flip({ tax: { vatRecoverabilityRatio: 1 } }));
    const itp = comp(r, "transfer_tax");
    expect(itp.type).toBe("ITP");
    expect(itp.amount).toBe(14_000);
    expect(itp.recoverability).toBe("none");
    expect(itp.recoverableAmount).toBe(0);
    expect(comp(r, "icio").type).toBe("ICIO");
    expect(comp(r, "icio").recoverableAmount).toBe(0);
    expect(comp(r, "licence_fee").type).toBe("TASA");
    expect(comp(r, "licence_fee").recoverableAmount).toBe(0);
  });

  it("fully recoverable works VAT: gross cash > effective cost, profit rises by the VAT, equity does not fall", () => {
    const base = computeFinancials(flip());
    const r = computeFinancials(flip({ tax: { vatRecoverabilityRatio: 1 } }));
    expect(r.tax.recoverableTotal).toBe(10_500);
    expect(r.tax.effectiveProjectCost).toBe(r.totals.totalProjectCost - 10_500);
    expect(r.tax.cashRequirement).toBe(r.totals.totalProjectCost);
    expect(r.tax.cashRequirement).toBeGreaterThan(r.tax.effectiveProjectCost);
    expect(r.metrics.netProfit.value).toBeCloseTo((base.metrics.netProfit.value ?? 0) + 10_500, 1);
    expect(r.metrics.equityRequired.value).toBe(base.metrics.equityRequired.value);
    expect(r.metrics.breakEvenPrice.value!).toBeLessThan(base.metrics.breakEvenPrice.value!);
    const recovery = r.cashflows.find((c) => c.label?.includes("Recuperación de IVA"));
    expect(recovery?.month).toBe(9);
    expect(recovery?.inflow).toBeGreaterThanOrEqual(10_500);
    // Cost lines are what is paid: the construction line stays gross (no double counting, no hidden VAT).
    expect(line(r, "construction")).toBe(60_500);
    const construction = r.tax.concepts.find((c) => c.key === "construction")!;
    expect(construction).toMatchObject({
      base: 50_000,
      taxAmount: 10_500,
      gross: 60_500,
      recoverableTax: 10_500,
      effectiveCost: 50_000,
      cashRequirement: 60_500,
    });
  });

  it("partial recoverability: recoverable < tax and the effective cost carries the rest", () => {
    const r = computeFinancials(flip({ tax: { vatRecoverabilityRatio: 0.4 } }));
    const vat = comp(r, "construction_vat");
    expect(vat.recoverability).toBe("partial");
    expect(vat.recoverableAmount).toBe(4_200);
    expect(vat.nonRecoverableAmount).toBe(6_300);
    expect(r.tax.effectiveProjectCost).toBe(r.totals.totalProjectCost - 4_200);
    expect(r.tax.vatRecoverability.status).toBe("INFERRED");
  });

  it("recoverability 0 stated by a professional equals the legacy figures but is no longer unknown", () => {
    const base = computeFinancials(flip());
    const r = computeFinancials(flip({ tax: { vatRecoverabilityRatio: 0 } }));
    expect(r.metrics.netProfit.value).toBe(base.metrics.netProfit.value);
    expect(r.tax.vatRecoverability.recoverability).toBe("none");
    expect(r.reviewItems.some((i) => i.includes("Deducibilidad del IVA"))).toBe(false);
  });

  it("a taxable base other than the price keeps both: tax on the base, notary and registry on the price", () => {
    const r = computeFinancials(flip({ acquisition: { ...flip().acquisition, taxableBase: 230_000 } }));
    const base = computeFinancials(flip());
    expect(line(r, "purchase")).toBe(200_000);
    expect(line(r, "transfer_tax")).toBe(16_100);
    expect(comp(r, "transfer_tax").taxableBase).toBe(230_000);
    expect(line(r, "notary")).toBe(line(base, "notary"));
    expect(line(r, "registry")).toBe(line(base, "registry"));
    expect(r.tax.concepts.find((c) => c.key === "acquisition")!.base).toBe(200_000);
  });

  it("a professional settlement replaces the rule-based transfer tax and keeps the estimate", () => {
    const r = computeFinancials(flip({ acquisition: { ...flip().acquisition, transferTaxManual: 13_400 } }));
    expect(line(r, "transfer_tax")).toBe(13_400);
    const c = comp(r, "transfer_tax");
    expect(c).toMatchObject({ amount: 13_400, estimatedAmount: 14_000, source: "professional" });
    expect(r.totals.acquisitionCosts).toBe(13_400 + line(r, "notary") + line(r, "registry") + 600);
  });

  it("new-build purchase: acquisition VAT follows the stated recoverability, AJD does not", () => {
    const inputs = flip({
      acquisition: { ...flip().acquisition, transferTaxMode: "IVA_AJD" },
      tax: { vatRecoverabilityRatio: 1 },
    });
    const r = computeFinancials(inputs);
    expect(comp(r, "transfer_tax").type).toBe("IVA");
    expect(comp(r, "transfer_tax").recoverableAmount).toBe(20_000);
    expect(comp(r, "ajd").recoverableAmount).toBe(0);
    expect(r.tax.recoverableTotal).toBe(20_000 + 10_500);
  });

  it("the investor's own tax stays outside the project profit and is labelled as such", () => {
    const r = computeFinancials(flip());
    const income = comp(r, "exit_income_tax");
    expect(income.type).toBe("IRPF");
    expect(income.concept).toBe("exit");
    expect(r.metrics.netProfit.explanation).toContain("antes de IRPF/IS");
    expect(r.metrics.roe.explanation).toContain("antes de IRPF/IS");
    expect(r.metrics.netProfitAfterTax.value).toBeCloseTo(
      (r.metrics.netProfit.value ?? 0) - income.amount,
      1,
    );
  });

  it("no double counting: tax components reconcile with cost lines; fees and commissions are marked unresolved", () => {
    const r = computeFinancials(flip({ tax: { vatRecoverabilityRatio: 1 } }));
    expect(comp(r, "construction_vat").amount + comp(r, "transfer_tax").amount + comp(r, "icio").amount).toBe(
      line(r, "construction") - 50_000 + line(r, "transfer_tax") + line(r, "icio"),
    );
    const sum = r.costLines
      .filter((l) => !["agency_sell", "sale_other", "exit_income_tax", "plusvalia"].includes(l.key))
      .reduce((a, l) => a + l.amount, 0);
    expect(sum).toBeCloseTo(r.totals.totalProjectCost, 0);
    expect(r.tax.concepts.find((c) => c.key === "professional_fees")).toMatchObject({
      base: 4_000,
      taxAmount: 0,
      taxStatus: "UNKNOWN",
    });
    expect(r.tax.concepts.find((c) => c.key === "sale_costs")?.taxStatus).toBe("UNKNOWN");
  });

  it("rejects a recoverability outside 0..1", () => {
    expect(() => computeFinancials(flip({ tax: { vatRecoverabilityRatio: 1.2 } }))).toThrow(
      FinancialEngineError,
    );
  });
});
