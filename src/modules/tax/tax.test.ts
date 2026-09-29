import { describe, expect, it } from "vitest";
import { applyBrackets, applyFeeScale, computeAcquisitionTaxes, computeExitTaxes } from "./compute";
import { TAX_RULES_ES_AND_SEVILLA_2025, resolveTaxRules } from "./rules";

describe("tax rules resolution", () => {
  it("resolves the Sevilla rule set for a 2025 date", () => {
    const r = resolveTaxRules({ country: "ES", region: "AND", municipalityCode: "41091" }, "2025-06-01");
    expect(r?.id).toBe("tax.es.and.sevilla.2025");
  });
  it("resolves the regional rule set, marked for review, for a covered municipality without ordinances", () => {
    const r = resolveTaxRules({ country: "ES", region: "AND", municipalityCode: "41038" }, "2026-01-15");
    expect(r?.id).toBe("tax.es.and.2025");
    expect(r?.status).toBe("REVIEW_REQUIRED");
    expect(r?.acquisition.itpRate).toBe(0.07);
    expect(r?.works.icioRate).toBe(0.04);
    expect(r?.notes.some((n) => n.includes("hipótesis prudente"))).toBe(true);
    expect(
      resolveTaxRules({ country: "ES", region: "AND", municipalityCode: "41091" }, "2026-01-15")?.id,
    ).toBe("tax.es.and.sevilla.2025");
  });
  it("returns undefined before effectiveFrom", () => {
    expect(resolveTaxRules({ country: "ES", region: "AND" }, "2020-01-01")).toBeUndefined();
  });
  it("returns undefined for an unknown country", () => {
    expect(resolveTaxRules({ country: "PT" }, "2025-01-01")).toBeUndefined();
  });
});

describe("fee scales and brackets", () => {
  it("notary scale is monotonic and starts with the fixed step", () => {
    const rules = TAX_RULES_ES_AND_SEVILLA_2025;
    const a = applyFeeScale(5_000, rules.acquisition.notaryScale);
    const b = applyFeeScale(200_000, rules.acquisition.notaryScale);
    const c = applyFeeScale(400_000, rules.acquisition.notaryScale);
    expect(a).toBe(90.15);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
  it("progressive brackets: 60.000 € gain", () => {
    const tax = applyBrackets(60_000, TAX_RULES_ES_AND_SEVILLA_2025.exit.capitalGainsIndividual);
    // 6000*0.19 + 44000*0.21 + 10000*0.23 = 1140 + 9240 + 2300
    expect(tax).toBe(12_680);
  });
});

describe("acquisition taxes", () => {
  it("ITP at 7 % for second hand", () => {
    const r = computeAcquisitionTaxes(200_000, "ITP", TAX_RULES_ES_AND_SEVILLA_2025);
    expect(r.transferTax).toBe(14_000);
    expect(r.ajd).toBe(0);
    expect(r.total).toBe(14_000 + r.notary + r.registry);
  });
  it("IVA + AJD for new residential", () => {
    const r = computeAcquisitionTaxes(200_000, "IVA_AJD", TAX_RULES_ES_AND_SEVILLA_2025, {
      assetUse: "residential",
    });
    expect(r.transferTax).toBe(20_000);
    expect(r.ajd).toBe(2_400);
  });
  it("IVA 21 % for commercial", () => {
    const r = computeAcquisitionTaxes(100_000, "IVA_AJD", TAX_RULES_ES_AND_SEVILLA_2025, {
      assetUse: "commercial",
    });
    expect(r.transferTax).toBe(21_000);
  });
});

describe("exit taxes", () => {
  it("individual gain uses brackets; company uses flat rate", () => {
    const ind = computeExitTaxes(40_000, "individual", TAX_RULES_ES_AND_SEVILLA_2025);
    expect(ind.incomeTax).toBe(6000 * 0.19 + 34_000 * 0.21);
    const co = computeExitTaxes(40_000, "company", TAX_RULES_ES_AND_SEVILLA_2025);
    expect(co.incomeTax).toBe(10_000);
  });
  it("negative gain yields zero tax and null plusvalía stays unknown", () => {
    const r = computeExitTaxes(-5_000, "individual", TAX_RULES_ES_AND_SEVILLA_2025);
    expect(r.incomeTax).toBe(0);
    expect(r.plusvaliaMunicipal).toBeNull();
  });
});
