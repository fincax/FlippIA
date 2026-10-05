import { formatDate, formatMoney } from "@/lib/format";
import type { AnalysisResult, StrategyResult } from "@/modules/analysis/types";
import {
  computeOpportunityDNA,
  computeOpportunityGap,
  rankStrategies,
  templateSynthesis,
} from "@/modules/analysis/synthesis";
import { computeMaximumAcquisitionPrice, runStressTest } from "@/modules/engines/financial";
import {
  getPath,
  updateBase,
  type Assumption,
  type Overrides,
  type ScenarioSet,
} from "@/modules/engines/scenario";
import {
  estimateForOptionalKey,
  issuerLabel,
  PROFESSIONAL_INPUT_REGISTRY,
  SOURCE_TYPE_META,
} from "./registry";
import { activeInputs, appliesTo, pickProfessionalInput, resolveEffectiveValue } from "./resolve";
import type { ProfessionalInput } from "./types";

/** The estimate a professional value replaces, as the twin recorded it. */
export interface EstimateRecord {
  value: number;
  source: Assumption["source"];
  status: Assumption["status"];
  note?: string;
}

export interface AppliedInput {
  input: ProfessionalInput;
  strategyId: string;
  estimate: EstimateRecord;
}

export interface RejectedInput {
  input: ProfessionalInput;
  strategyId?: string;
  reason: string;
}

export interface ApplyReport<T> {
  /** Same reference as the argument when nothing applied: existing deals are untouched. */
  result: T;
  applied: AppliedInput[];
  rejected: RejectedInput[];
}

/** Assumption note that keeps the estimate visible next to the professional value. */
export function provenanceNote(input: ProfessionalInput, estimate: EstimateRecord): string {
  const meta = SOURCE_TYPE_META[input.sourceType];
  const who = input.enteredByName ?? input.enteredBy;
  const parts = [
    `Estimación FlippIA: ${formatMoney(estimate.value)}.`,
    `${meta.label} introducido por ${who} el ${formatDate(input.enteredAt)} (${issuerLabel(input.issuer)}), bajo su responsabilidad.`,
  ];
  if (input.marginAmount > 0)
    parts.push(
      `Neto ${formatMoney(input.netValue)} + margen comercial ${formatMoney(input.marginAmount)} = ${formatMoney(input.value)}, sin impuestos; los impuestos aplicables se calculan aparte.`,
    );
  else parts.push("Importe sin impuestos; los impuestos aplicables se calculan aparte.");
  if (input.taxMode === "included" && input.enteredAmount !== undefined)
    parts.push(
      `Introducido con impuestos incluidos (${formatMoney(input.enteredAmount)}); base ${formatMoney(input.value)}${input.taxRateApplied !== undefined ? ` al ${Math.round(input.taxRateApplied * 100)} %` : ""}.`,
    );
  if (input.reason) parts.push(input.reason.endsWith(".") ? input.reason : `${input.reason}.`);
  return parts.join(" ");
}

/**
 * Lay the professional inputs over a scenario set without persisting anything.
 * Recomputation reuses the Digital Twin rule (`updateBase`): only the scenarios
 * whose effective inputs change are recomputed; a custom scenario that overrides
 * the same path keeps its own hypothesis (scenario isolation).
 */
export function applyToScenarioSet(
  set: ScenarioSet,
  inputs: readonly ProfessionalInput[],
  now = new Date(),
): ApplyReport<ScenarioSet> {
  const applied: AppliedInput[] = [];
  const rejected: RejectedInput[] = [];
  const changes: Overrides = {};
  const keys = new Set(
    activeInputs(inputs)
      .filter((i) => appliesTo(i, set.strategyId))
      .map((i) => i.key),
  );
  const baseResult = set.scenarios.find((x) => x.kind === "base")?.result;
  for (const key of keys) {
    const input = pickProfessionalInput(inputs, key, set.strategyId)!;
    const def = PROFESSIONAL_INPUT_REGISTRY[key];
    const current = getPath(set.base, key);
    if (typeof current !== "number" && !def.optional) {
      rejected.push({ input, strategyId: set.strategyId, reason: "La estrategia no utiliza este dato." });
      continue;
    }
    if (input.taxBreakdownPending) {
      rejected.push({
        input,
        strategyId: set.strategyId,
        reason: "Impuestos incluidos y desglose pendiente: no se aplica hasta conocer el tratamiento fiscal.",
      });
      continue;
    }
    const assumption = set.assumptions.find((a) => a.path === key);
    const fallback =
      typeof current === "number" ? current : baseResult ? estimateForOptionalKey(key, baseResult) : null;
    const estimate: EstimateRecord = assumption
      ? {
          value: typeof assumption.value === "number" ? assumption.value : (fallback ?? 0),
          source: assumption.source,
          status: assumption.status,
          note: assumption.note,
        }
      : { value: fallback ?? 0, source: "engine", status: fallback === null ? "UNKNOWN" : "INFERRED" };
    changes[key] = input.value;
    applied.push({ input, strategyId: set.strategyId, estimate });
  }
  if (!applied.length) return { result: set, applied, rejected };

  const { set: next } = updateBase(set, changes, now);
  const byPath = new Map(applied.map((a) => [a.input.key as string, a]));
  const assumptions: Assumption[] = next.assumptions.map((a) => {
    const hit = byPath.get(a.path);
    if (!hit) return a;
    byPath.delete(a.path);
    return {
      ...a,
      value: hit.input.value,
      source: "professional",
      status: hit.input.status,
      note: provenanceNote(hit.input, hit.estimate),
    };
  });
  for (const hit of byPath.values()) {
    const def = PROFESSIONAL_INPUT_REGISTRY[hit.input.key];
    assumptions.push({
      path: hit.input.key,
      label: def.label,
      value: hit.input.value,
      unit: def.unit,
      source: "professional",
      evidenceIds: [],
      status: hit.input.status,
      note: provenanceNote(hit.input, hit.estimate),
    });
  }
  // A view over the stored twin: keep its persisted version.
  return {
    result: { ...next, assumptions, version: set.version, updatedAt: set.updatedAt },
    applied,
    rejected,
  };
}

/** Same derivation the investment agent performs from a strategy's base inputs. */
function recomputeStrategy(
  s: StrategyResult,
  set: ScenarioSet,
  investor: AnalysisResult["investor"],
): StrategyResult {
  const base = set.scenarios.find((x) => x.kind === "base")?.result;
  if (!base) return { ...s, scenarioSet: set };
  return {
    ...s,
    scenarioSet: set,
    headline: {
      netProfit: base.metrics.netProfit.value,
      roe: base.metrics.roe.value,
      annualizedRoe: base.metrics.annualizedRoe.value,
      irr: base.metrics.irr.value,
      equityRequired: base.metrics.equityRequired.value,
      durationMonths: set.base.holding.durationMonths,
      salePrice: set.base.exit.kind === "sale" ? set.base.exit.salePrice : null,
      monthlyRent: set.base.exit.kind === "rent" ? set.base.exit.monthlyRent : null,
      margin: base.metrics.margin.value,
    },
    stress: runStressTest(set.base, { minimumProfit: 0 }),
    maxPrice: computeMaximumAcquisitionPrice(set.base, {
      minimumRoe: investor.targetRoe,
      minimumProfit: investor.targetProfit,
      maximumCapital: investor.maxEquityPerDeal,
    }),
  };
}

/** Line `templateSynthesis` adds when no real purchase price is known. */
const MISSING_PURCHASE_PRICE = "Precio de compra real.";

/**
 * The effective analysis: the stored result with professional inputs laid over
 * the deterministic financial chain (scenarios → headline, stress, maximum price
 * → ranking → opportunity gap → DNA → templated synthesis). Market, urbanism,
 * architecture, regulatory, property and the adversarial findings are not
 * recomputed: they do not depend on these inputs or need the agents to run.
 * Without active inputs the stored analysis is returned as is.
 */
export function applyToAnalysis(
  analysis: AnalysisResult,
  inputs: readonly ProfessionalInput[],
  now = new Date(),
): ApplyReport<AnalysisResult> {
  const active = activeInputs(inputs);
  if (!active.length) return { result: analysis, applied: [], rejected: [] };
  const applied: AppliedInput[] = [];
  const rejected: RejectedInput[] = [];
  const ids = new Set(analysis.strategies.map((s) => s.id));
  for (const i of active)
    if (i.strategyId !== undefined && !ids.has(i.strategyId))
      rejected.push({ input: i, strategyId: i.strategyId, reason: "La estrategia no está en el análisis." });

  let changed = false;
  const strategies = analysis.strategies.map((s) => {
    const r = applyToScenarioSet(s.scenarioSet, inputs, now);
    applied.push(...r.applied);
    rejected.push(...r.rejected);
    if (r.result === s.scenarioSet) return s;
    changed = true;
    return recomputeStrategy(s, r.result, analysis.investor);
  });
  if (!changed) return { result: analysis, applied, rejected };

  const ranked = rankStrategies(strategies, analysis.investor);
  const stressByStrategy = { ...analysis.risk.stressByStrategy };
  for (const s of ranked) if (s.stress) stressByStrategy[s.id] = s.stress;
  const risk = { ...analysis.risk, stressByStrategy };
  const purchase = resolveEffectiveValue({
    inputs,
    key: "acquisition.purchasePrice",
    fallback: { value: analysis.property.askingPrice, source: "estimate" },
  });
  const gap = computeOpportunityGap(ranked, analysis.market, purchase.value ?? analysis.property.askingPrice);
  const dna = computeOpportunityDNA({
    strategies: ranked,
    market: analysis.market,
    urbanism: analysis.urbanism,
    architecture: analysis.architecture,
    finance: analysis.finance,
    risk,
    profile: analysis.property,
    gap,
  });
  const synthesis = templateSynthesis({
    profile: analysis.property,
    strategies: ranked,
    gap,
    risk,
    urbanism: analysis.urbanism,
    market: analysis.market,
    investor: analysis.investor,
  });
  if (purchase.source === "professional")
    synthesis.missingData = synthesis.missingData.filter((m) => m !== MISSING_PURCHASE_PRICE);
  return {
    result: { ...analysis, strategies: ranked, risk, gap, dna, synthesis },
    applied,
    rejected,
  };
}
