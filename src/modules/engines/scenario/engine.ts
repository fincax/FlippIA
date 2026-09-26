import { newId } from "@/modules/core/ids";
import { computeFinancials, type FinancialInputs, type MetricKey } from "@/modules/engines/financial";
import { applyOverrides, pathsOverlap } from "./paths";
import type { Assumption, Overrides, RecomputeReport, Scenario, ScenarioKind, ScenarioSet } from "./types";

/**
 * Standard derived scenarios. They are expressed as *relative* overrides
 * computed from the base at build time, so that a change in the base
 * propagates (the Digital Investment Twin recomputes them) while a user's
 * explicit override on a custom scenario is preserved.
 */
export function standardOverrides(
  kind: Exclude<ScenarioKind, "base" | "custom">,
  base: FinancialInputs,
): Overrides {
  const salePath = base.exit.kind === "sale" ? "exit.salePrice" : "exit.terminalValue";
  const salePrice = base.exit.kind === "sale" ? base.exit.salePrice : base.exit.terminalValue;
  const reno = base.transformation.renovationBudget;
  const dur = base.holding.durationMonths;
  switch (kind) {
    case "optimistic":
      return {
        [salePath]: Math.round(salePrice * 1.05),
        "transformation.renovationBudget": Math.round(reno * 0.95),
        "holding.durationMonths": Math.max(1, dur - 1),
      };
    case "conservative":
      return {
        [salePath]: Math.round(salePrice * 0.95),
        "transformation.renovationBudget": Math.round(reno * 1.1),
        "holding.durationMonths": dur + 2,
      };
    case "stress":
      return {
        [salePath]: Math.round(salePrice * 0.9),
        "transformation.renovationBudget": Math.round(reno * 1.2),
        "holding.durationMonths": dur + 6,
      };
  }
}

const KIND_META: Record<ScenarioKind, { name: string; description: string }> = {
  base: { name: "Base", description: "Hipótesis centrales del análisis." },
  optimistic: { name: "Optimista", description: "Venta +5 %, obra −5 %, un mes menos." },
  conservative: { name: "Conservador", description: "Venta −5 %, obra +10 %, dos meses más." },
  stress: { name: "Estrés", description: "Venta −10 %, obra +20 %, seis meses más." },
  custom: { name: "Personalizado", description: "Definido por el usuario." },
};

export function buildScenarioSet(params: {
  dealId: string;
  strategyId: string;
  base: FinancialInputs;
  assumptions: Assumption[];
  now?: Date;
}): ScenarioSet {
  const now = (params.now ?? new Date()).toISOString();
  const kinds: Array<"base" | "optimistic" | "conservative" | "stress"> = [
    "base",
    "optimistic",
    "conservative",
    "stress",
  ];
  const scenarios: Scenario[] = kinds.map((kind) => {
    const overrides = kind === "base" ? {} : standardOverrides(kind, params.base);
    const inputs = applyOverrides(params.base, overrides);
    return {
      id: newId("scn"),
      name: KIND_META[kind].name,
      kind,
      description: KIND_META[kind].description,
      overrides,
      inputs,
      result: computeFinancials(inputs),
      computedAt: now,
      dependsOnBase: true,
    };
  });
  return {
    dealId: params.dealId,
    strategyId: params.strategyId,
    base: params.base,
    assumptions: params.assumptions,
    scenarios,
    version: 1,
    updatedAt: now,
  };
}

export function addCustomScenario(
  set: ScenarioSet,
  name: string,
  overrides: Overrides,
  description = KIND_META.custom.description,
  now = new Date(),
): ScenarioSet {
  const inputs = applyOverrides(set.base, overrides);
  const scenario: Scenario = {
    id: newId("scn"),
    name,
    kind: "custom",
    description,
    overrides,
    inputs,
    result: computeFinancials(inputs),
    computedAt: now.toISOString(),
    dependsOnBase: true,
  };
  return {
    ...set,
    scenarios: [...set.scenarios, scenario],
    version: set.version + 1,
    updatedAt: now.toISOString(),
  };
}

/**
 * Digital Investment Twin recompute. Given changed base paths, recompute only
 * the scenarios whose effective inputs change: a scenario that overrides every
 * changed path is unaffected and is skipped.
 */
export function updateBase(
  set: ScenarioSet,
  changes: Overrides,
  now = new Date(),
): { set: ScenarioSet; report: RecomputeReport } {
  const changedPaths = Object.keys(changes);
  const newBase = applyOverrides(set.base, changes);
  const recomputed: RecomputeReport["recomputed"] = [];
  const skipped: RecomputeReport["skipped"] = [];
  const scenarios = set.scenarios.map((s) => {
    const overridePaths = Object.keys(s.overrides);
    const affected = changedPaths.filter((p) => !overridePaths.some((o) => pathsOverlap(o, p)));
    // Standard scenarios are relative: rebuild their overrides from the new base.
    const standardKind =
      s.kind === "optimistic" || s.kind === "conservative" || s.kind === "stress" ? s.kind : null;
    const isStandard = standardKind !== null;
    if (affected.length === 0 && !isStandard) {
      skipped.push({ scenarioId: s.id, reason: `Sobrescribe ${overridePaths.join(", ")}; no le afecta.` });
      return s;
    }
    const overrides = standardKind ? standardOverrides(standardKind, newBase) : s.overrides;
    const inputs = applyOverrides(newBase, overrides);
    recomputed.push({
      scenarioId: s.id,
      reason: isStandard
        ? `Escenario relativo: recalculado sobre la nueva base (${changedPaths.join(", ")}).`
        : `Afectado por ${affected.join(", ")}.`,
    });
    return { ...s, overrides, inputs, result: computeFinancials(inputs), computedAt: now.toISOString() };
  });
  const assumptions = set.assumptions.map((a) =>
    a.path in changes
      ? { ...a, value: changes[a.path]!, source: "user" as const, status: "INFERRED" as const }
      : a,
  );
  return {
    set: {
      ...set,
      base: newBase,
      assumptions,
      scenarios,
      version: set.version + 1,
      updatedAt: now.toISOString(),
    },
    report: { changedPaths, recomputed, skipped },
  };
}

/** Evaluate a hypothetical without persisting anything (What-if). */
export function evaluateWhatIf(set: ScenarioSet, overrides: Overrides, fromScenarioId?: string) {
  const from =
    set.scenarios.find((s) => s.id === fromScenarioId) ?? set.scenarios.find((s) => s.kind === "base")!;
  const inputs = applyOverrides(from.inputs, overrides);
  return { from, inputs, result: computeFinancials(inputs) };
}

export function compareScenarios(set: ScenarioSet, metricKeys: MetricKey[]) {
  return set.scenarios.map((s) => ({
    scenarioId: s.id,
    name: s.name,
    kind: s.kind,
    metrics: Object.fromEntries(metricKeys.map((k) => [k, s.result?.metrics[k]?.value ?? null])) as Record<
      MetricKey,
      number | null
    >,
  }));
}
