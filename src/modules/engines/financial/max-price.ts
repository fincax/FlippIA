import { round0 } from "@/modules/core/math";
import { computeFinancials } from "./engine";
import type { FinancialInputs } from "./types";

export interface AcquisitionConstraints {
  minimumRoe?: number;
  minimumProfit?: number;
  minimumMargin?: number;
  maximumCapital?: number;
  maximumLtc?: number;
  maximumDuration?: number;
}

export interface MaxPriceResult {
  maximumPrice: number;
  bindingConstraint: keyof AcquisitionConstraints | "none";
  /** Result of every constraint at the maximum price. */
  checks: Array<{ constraint: keyof AcquisitionConstraints; limit: number; valueAtMax: number | null; satisfied: boolean }>;
  iterations: number;
  askingPrice: number;
  /** Positive: room below asking. Negative: asking is above the maximum. */
  headroom: number;
}

function constraintsSatisfied(inputs: FinancialInputs, c: AcquisitionConstraints) {
  const r = computeFinancials(inputs);
  const m = r.metrics;
  const checks: MaxPriceResult["checks"] = [];
  const add = (constraint: keyof AcquisitionConstraints, limit: number | undefined, value: number | null, ok: (v: number) => boolean) => {
    if (limit === undefined) return;
    checks.push({ constraint, limit, valueAtMax: value, satisfied: value === null ? false : ok(value) });
  };
  add("minimumRoe", c.minimumRoe, m.roe.value, (v) => v >= (c.minimumRoe ?? 0));
  add("minimumProfit", c.minimumProfit, m.netProfit.value, (v) => v >= (c.minimumProfit ?? 0));
  add("minimumMargin", c.minimumMargin, m.margin.value, (v) => v >= (c.minimumMargin ?? 0));
  add("maximumCapital", c.maximumCapital, m.equityRequired.value, (v) => v <= (c.maximumCapital ?? Infinity));
  add("maximumLtc", c.maximumLtc, m.ltc.value ?? 0, (v) => v <= (c.maximumLtc ?? Infinity));
  add("maximumDuration", c.maximumDuration, m.durationMonths.value, (v) => v <= (c.maximumDuration ?? Infinity));
  return { checks, all: checks.every((k) => k.satisfied) };
}

/**
 * Maximum acquisition price compatible with the investor's constraints.
 * Bisection over purchase price: every constraint is monotonic in price
 * (higher price → lower ROE/profit/margin, higher capital/LTC), so the feasible
 * set is an interval [0, max].
 */
export function computeMaximumAcquisitionPrice(base: FinancialInputs, constraints: AcquisitionConstraints): MaxPriceResult {
  const asking = base.acquisition.purchasePrice;
  const withPrice = (p: number): FinancialInputs => ({ ...base, acquisition: { ...base.acquisition, purchasePrice: p } });

  const hi0 = Math.max(asking * 3, 100_000);
  let lo = 0;
  let hi = hi0;
  let iterations = 0;
  const atZero = constraintsSatisfied(withPrice(0), constraints);
  if (!atZero.all) {
    // Even free, the deal fails a constraint (e.g. duration). Report.
    const failing = atZero.checks.find((c) => !c.satisfied);
    return { maximumPrice: 0, bindingConstraint: failing?.constraint ?? "none", checks: atZero.checks, iterations: 1, askingPrice: asking, headroom: -asking };
  }
  if (constraintsSatisfied(withPrice(hi), constraints).all) {
    return { maximumPrice: hi, bindingConstraint: "none", checks: constraintsSatisfied(withPrice(hi), constraints).checks, iterations: 2, askingPrice: asking, headroom: hi - asking };
  }
  while (hi - lo > 50 && iterations < 60) {
    const mid = (lo + hi) / 2;
    if (constraintsSatisfied(withPrice(mid), constraints).all) lo = mid;
    else hi = mid;
    iterations++;
  }
  const maximumPrice = round0(Math.floor(lo / 100) * 100);
  const final = constraintsSatisfied(withPrice(maximumPrice), constraints);
  const justAbove = constraintsSatisfied(withPrice(maximumPrice + 500), constraints);
  const binding = justAbove.checks.find((c) => !c.satisfied)?.constraint ?? "none";
  return { maximumPrice, bindingConstraint: binding, checks: final.checks, iterations, askingPrice: asking, headroom: round0(maximumPrice - asking) };
}
