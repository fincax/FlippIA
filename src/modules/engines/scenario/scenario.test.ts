import { describe, expect, it } from "vitest";
import { baseSaleInputs } from "@/modules/engines/financial";
import { addCustomScenario, buildScenarioSet, compareScenarios, evaluateWhatIf, updateBase } from "./engine";
import { applyOverrides, getPath, pathsOverlap, setPath } from "./paths";

describe("paths", () => {
  it("get/set nested paths immutably", () => {
    const base = baseSaleInputs();
    const next = setPath(base, "exit.salePrice", 999);
    expect(getPath(next, "exit.salePrice")).toBe(999);
    expect(getPath(base, "exit.salePrice")).toBe(310_000);
  });
  it("overlap detects prefixes", () => {
    expect(pathsOverlap("exit", "exit.salePrice")).toBe(true);
    expect(pathsOverlap("exit.salePrice", "holding.durationMonths")).toBe(false);
  });
  it("applies multiple overrides", () => {
    const next = applyOverrides(baseSaleInputs(), { "exit.salePrice": 1, "holding.durationMonths": 2 });
    expect(next.holding.durationMonths).toBe(2);
  });
});

describe("scenario set", () => {
  const set = buildScenarioSet({ dealId: "deal_x", strategyId: "flip", base: baseSaleInputs(), assumptions: [] });

  it("creates base + three standard scenarios, all computed", () => {
    expect(set.scenarios.map((s) => s.kind)).toEqual(["base", "optimistic", "conservative", "stress"]);
    expect(set.scenarios.every((s) => s.result !== null)).toBe(true);
  });
  it("orders profit optimistic > base > conservative > stress", () => {
    const p = (k: string) => set.scenarios.find((s) => s.kind === k)!.result!.metrics.netProfit.value!;
    expect(p("optimistic")).toBeGreaterThan(p("base"));
    expect(p("base")).toBeGreaterThan(p("conservative"));
    expect(p("conservative")).toBeGreaterThan(p("stress"));
  });
  it("custom scenario keeps its override when the base changes elsewhere", () => {
    const withCustom = addCustomScenario(set, "Venta 330k", { "exit.salePrice": 330_000 });
    const { set: updated, report } = updateBase(withCustom, { "transformation.renovationBudget": 50_000 });
    const custom = updated.scenarios.find((s) => s.kind === "custom")!;
    expect(custom.inputs.exit.kind === "sale" && custom.inputs.exit.salePrice).toBe(330_000);
    expect(custom.inputs.transformation.renovationBudget).toBe(50_000);
    expect(report.recomputed.map((r) => r.scenarioId)).toContain(custom.id);
    expect(updated.version).toBe(withCustom.version + 1);
  });
  it("skips a custom scenario that overrides every changed path", () => {
    const withCustom = addCustomScenario(set, "Reno fija", { "transformation.renovationBudget": 45_000 });
    const { report } = updateBase(withCustom, { "transformation.renovationBudget": 60_000 });
    const custom = withCustom.scenarios.find((s) => s.kind === "custom")!;
    expect(report.skipped.map((r) => r.scenarioId)).toContain(custom.id);
  });
  it("standard scenarios are rebuilt relative to the new base", () => {
    const { set: updated } = updateBase(set, { "exit.salePrice": 400_000 });
    const opt = updated.scenarios.find((s) => s.kind === "optimistic")!;
    expect(opt.inputs.exit.kind === "sale" && opt.inputs.exit.salePrice).toBe(420_000);
  });
  it("what-if does not mutate the set", () => {
    const before = JSON.stringify(set);
    const wi = evaluateWhatIf(set, { "transformation.renovationBudget": 55_000 });
    expect(wi.result.metrics.netProfit.value!).toBeLessThan(set.scenarios[0]!.result!.metrics.netProfit.value!);
    expect(JSON.stringify(set)).toBe(before);
  });
  it("compare returns a row per scenario", () => {
    const rows = compareScenarios(set, ["netProfit", "roe"]);
    expect(rows).toHaveLength(4);
    expect(rows[0]!.metrics.netProfit).not.toBeNull();
  });
});
