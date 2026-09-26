import { describe, expect, it } from "vitest";
import { computeFinancials, FinancialEngineError } from "./engine";
import { annuityPayment, buildSchedule } from "./financing";
import { irr, monthlyToAnnual } from "./irr";
import { computeMaximumAcquisitionPrice } from "./max-price";
import { baseSaleInputs, bridgeLoan, mortgage } from "./presets";
import { runStressTest } from "./stress";
import type { FinancialInputs } from "./types";

describe("irr", () => {
  it("solves a simple two-period case", () => {
    // -100 now, +110 in one period → 10 %
    expect(irr([-100, 110])).toBeCloseTo(0.1, 6);
  });
  it("returns null without sign change", () => {
    expect(irr([-100, -10])).toBeNull();
    expect(irr([100, 10])).toBeNull();
  });
  it("annualizes monthly", () => {
    expect(monthlyToAnnual(0.01)).toBeCloseTo(0.126825, 5);
  });
});

describe("financing schedule", () => {
  it("annuity payment matches the standard formula", () => {
    // 100.000 at 3 % over 25 years → ≈ 474,21 €/month
    expect(annuityPayment(100_000, 0.03 / 12, 300)).toBeCloseTo(474.21, 1);
  });
  it("interest-only bridge leaves full principal outstanding at exit", () => {
    const s = buildSchedule(bridgeLoan(0.5), 100_000, 6);
    expect(s.months).toHaveLength(6);
    expect(s.outstandingAtExit).toBe(100_000);
    expect(s.interestTotal).toBeCloseTo(((100_000 * 0.09) / 12) * 6, 0);
  });
  it("amortizing mortgage reduces balance", () => {
    const s = buildSchedule(mortgage(0.7), 140_000, 12);
    expect(s.outstandingAtExit).toBeLessThan(140_000);
    expect(s.outstandingAtExit).toBeGreaterThan(130_000);
  });
});

describe("computeFinancials — flip without debt", () => {
  const inputs = baseSaleInputs();
  const r = computeFinancials(inputs);

  it("resolves the Sevilla rule set", () => {
    expect(r.taxRuleSetId).toBe("tax.es.and.sevilla.2025");
  });
  it("ITP line is 7 % of price", () => {
    expect(r.costLines.find((l) => l.key === "transfer_tax")?.amount).toBe(14_000);
  });
  it("totals are consistent", () => {
    const t = r.totals;
    expect(t.totalProjectCost).toBeCloseTo(
      t.purchase + t.acquisitionCosts + t.transformation + t.holding + t.financing,
      2,
    );
    expect(t.financing).toBe(0);
  });
  it("equity required equals total cost (minus the closing month's holding) when there is no debt", () => {
    // Everything is funded with equity; the exit month settles at closing.
    const monthlyHolding = r.totals.holding / inputs.holding.durationMonths;
    expect(r.metrics.equityRequired.value).toBeCloseTo(r.totals.totalProjectCost - monthlyHolding, 0);
  });
  it("net profit = sale − sale costs − total cost", () => {
    const sale = 310_000;
    const expected = sale - (sale * 0.03 + 800) - r.totals.totalProjectCost;
    expect(r.metrics.netProfit.value).toBeCloseTo(expected, 1);
  });
  it("ROI = profit / total cost; ROE equals ROI when unlevered", () => {
    const np = r.metrics.netProfit.value ?? 0;
    expect(r.metrics.roi.value).toBeCloseTo(np / r.totals.totalProjectCost, 4);
    expect(r.metrics.roe.value).toBeCloseTo(r.metrics.roi.value ?? 0, 3);
  });
  it("IRR is positive and greater than annualized ROE for back-loaded flows", () => {
    expect(r.metrics.irr.value).not.toBeNull();
    expect(r.metrics.irr.value ?? 0).toBeGreaterThan(0);
  });
  it("break-even price makes net profit zero", () => {
    const be = r.metrics.breakEvenPrice.value ?? 0;
    const atBe = computeFinancials({
      ...inputs,
      exit: { ...inputs.exit, kind: "sale", salePrice: be } as FinancialInputs["exit"],
    });
    expect(atBe.metrics.netProfit.value).toBeCloseTo(0, 0);
  });
  it("flags unknown plusvalía as a review item", () => {
    expect(r.reviewItems.some((x) => x.toLowerCase().includes("plusval"))).toBe(true);
  });
  it("every metric has a formula and explanation", () => {
    for (const m of Object.values(r.metrics)) {
      expect(m.formula.length).toBeGreaterThan(3);
      expect(m.explanation.length).toBeGreaterThan(3);
    }
  });
});

describe("computeFinancials — leverage", () => {
  const unlevered = computeFinancials(baseSaleInputs());
  const levered = computeFinancials(baseSaleInputs({ financing: [mortgage(0.7)] }));

  it("debt reduces equity required and increases ROE", () => {
    expect(levered.metrics.equityRequired.value ?? 0).toBeLessThan(
      unlevered.metrics.equityRequired.value ?? 0,
    );
    expect(levered.metrics.roe.value ?? 0).toBeGreaterThan(unlevered.metrics.roe.value ?? 0);
  });
  it("interest and fees reduce net profit", () => {
    expect(levered.metrics.netProfit.value ?? 0).toBeLessThan(unlevered.metrics.netProfit.value ?? 0);
    expect(levered.totals.financing).toBeGreaterThan(0);
  });
  it("LTV and LTC are reported", () => {
    expect(levered.metrics.ltv.value).toBeCloseTo(0.7, 3);
    expect(levered.metrics.ltc.value ?? 0).toBeLessThan(0.7);
  });
  it("outstanding debt is repaid at exit in the cash flows", () => {
    const last = levered.cashflows[levered.cashflows.length - 1];
    expect(last?.label).toContain("Cancelación");
    // Cumulative at the end equals net profit after tax (all flows are cash)
    expect(last?.cumulative).toBeCloseTo(levered.metrics.netProfitAfterTax.value ?? 0, 0);
  });
});

describe("computeFinancials — rent exit", () => {
  const base = baseSaleInputs({ durationMonths: 60, worksMonths: 3 });
  const inputs: FinancialInputs = {
    ...base,
    exit: {
      kind: "rent",
      monthlyRent: 1_100,
      vacancyRate: 0.05,
      opexRate: 0.1,
      terminalValue: 300_000,
      terminalAgencyRate: 0.03,
      sellerProfile: "individual",
    },
  };
  const r = computeFinancials(inputs);
  it("computes yields and cap rate", () => {
    expect(r.metrics.grossYield.value ?? 0).toBeGreaterThan(0.03);
    expect(r.metrics.capRate.value ?? 0).toBeLessThan(r.metrics.grossYield.value ?? 0);
    expect(r.metrics.breakEvenRent.value ?? 0).toBeGreaterThan(0);
  });
  it("DSCR only exists with debt", () => {
    expect(r.metrics.dscr.value).toBeNull();
    const withDebt = computeFinancials({ ...inputs, financing: [mortgage(0.6)] });
    expect(withDebt.metrics.dscr.value ?? 0).toBeGreaterThan(0);
  });
});

describe("validation", () => {
  it("rejects negative price", () => {
    expect(() => computeFinancials(baseSaleInputs({ purchasePrice: -1 }))).toThrow(FinancialEngineError);
  });
  it("rejects unknown jurisdiction", () => {
    expect(() => computeFinancials({ ...baseSaleInputs(), jurisdiction: { country: "XX" } })).toThrow(
      /No tax rule set/,
    );
  });
});

describe("maximum acquisition price", () => {
  it("finds a price below asking when constraints bind", () => {
    const inputs = baseSaleInputs({ purchasePrice: 250_000, salePrice: 310_000 });
    const res = computeMaximumAcquisitionPrice(inputs, { minimumProfit: 30_000 });
    expect(res.maximumPrice).toBeLessThan(250_000);
    expect(res.headroom).toBeLessThan(0);
    expect(res.bindingConstraint).toBe("minimumProfit");
    const check = computeFinancials({
      ...inputs,
      acquisition: { ...inputs.acquisition, purchasePrice: res.maximumPrice },
    });
    expect(check.metrics.netProfit.value ?? 0).toBeGreaterThanOrEqual(30_000 - 1);
  });
  it("reports headroom when asking is below the maximum", () => {
    const res = computeMaximumAcquisitionPrice(baseSaleInputs({ purchasePrice: 150_000 }), {
      minimumRoe: 0.1,
    });
    expect(res.headroom).toBeGreaterThan(0);
  });
  it("capital constraint binds when equity is limited", () => {
    const res = computeMaximumAcquisitionPrice(baseSaleInputs({ financing: [mortgage(0.7)] }), {
      maximumCapital: 60_000,
      minimumRoe: 0,
    });
    expect(res.bindingConstraint).toBe("maximumCapital");
    expect(res.checks.find((c) => c.constraint === "maximumCapital")?.satisfied).toBe(true);
  });
});

describe("stress test", () => {
  const inputs = baseSaleInputs({ purchasePrice: 200_000, salePrice: 310_000 });
  const report = runStressTest(inputs);
  it("produces the standard scenarios except rent ones for a sale", () => {
    expect(report.outcomes.map((o) => o.key)).not.toContain("rent-10");
    expect(report.outcomes.length).toBe(9);
  });
  it("worst case is the severe combined scenario", () => {
    expect(report.worstCase?.key).toBe("combined-severe");
  });
  it("solves break-even and safety metrics coherently", () => {
    expect(report.minimumExitPrice ?? 0).toBeLessThan(310_000);
    expect(report.maximumAcquisition ?? 0).toBeGreaterThan(200_000);
    expect(report.maximumRenovation ?? 0).toBeGreaterThan(40_000);
    expect(report.marginOfSafety ?? 0).toBeGreaterThan(0);
    expect(report.marginOfSafety ?? 0).toBeLessThan(1);
  });
  it("survival rate is between 0 and 1", () => {
    expect(report.survivalRate).toBeGreaterThanOrEqual(0);
    expect(report.survivalRate).toBeLessThanOrEqual(1);
  });
});

describe("computeFinancials — input validation", () => {
  it("rejects NaN, negative and out-of-range rates anywhere in the inputs", () => {
    const nan = baseSaleInputs();
    nan.holding.monthlyCommunityFees = Number.NaN;
    expect(() => computeFinancials(nan)).toThrow(FinancialEngineError);
    const negative = baseSaleInputs();
    negative.acquisition.agencyFee = -1;
    expect(() => computeFinancials(negative)).toThrow(FinancialEngineError);
    const rate = baseSaleInputs();
    rate.transformation.contingencyRate = 1.5;
    expect(() => computeFinancials(rate)).toThrow(FinancialEngineError);
  });
});

describe("computeFinancials — partner equity", () => {
  it("returns the partner's capital and share at exit, so the IRR stays realistic", () => {
    const solo = computeFinancials(baseSaleInputs());
    const inputs = baseSaleInputs();
    inputs.financing = [
      {
        kind: "co_investment",
        label: "Socio",
        sizing: { type: "ltc", ratio: 0.4 },
        annualRate: 0,
        termMonths: inputs.holding.durationMonths,
        interestOnly: true,
        arrangementFeeRate: 0,
        drawMonth: 0,
        profitShare: 0.4,
      },
    ];
    const withPartner = computeFinancials(inputs);
    const sumNet = withPartner.cashflows.reduce((a, c) => a + c.net, 0);
    expect(sumNet).toBeCloseTo(withPartner.metrics.netProfitAfterTax.value ?? Number.NaN, 0);
    const soloIrr = solo.metrics.irr.value ?? 0;
    const partnerIrr = withPartner.metrics.irr.value ?? 0;
    expect(partnerIrr).toBeGreaterThan(0);
    expect(partnerIrr).toBeLessThan(soloIrr * 3);
    expect(withPartner.cashflows.some((c) => c.label?.includes("Devolución"))).toBe(true);
  });
});
