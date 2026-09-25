import type { EvidenceStatus } from "@/modules/core/evidence-status";
import type { FinancialInputs, FinancialResult } from "@/modules/engines/financial";

export type ScenarioKind = "base" | "optimistic" | "conservative" | "stress" | "custom";

export type AssumptionSource = "user" | "market" | "engine" | "demo" | "rule" | "adapter" | "professional";

/**
 * An assumption is a named, sourced input. Scenario inputs are materialized
 * from assumptions; every number the engine uses can be traced back to one.
 */
export interface Assumption {
  /** Dot path inside FinancialInputs, e.g. "exit.salePrice". */
  path: string;
  label: string;
  value: number | string | boolean;
  unit?: "currency" | "ratio" | "months" | "number" | "text";
  source: AssumptionSource;
  evidenceIds: string[];
  status: EvidenceStatus;
  note?: string;
}

/** A flat path → value map. */
export type Overrides = Record<string, number | string | boolean>;

export interface Scenario {
  id: string;
  name: string;
  kind: ScenarioKind;
  description: string;
  overrides: Overrides;
  inputs: FinancialInputs;
  result: FinancialResult | null;
  computedAt: string | null;
  /** Paths whose base value this scenario overrides. */
  dependsOnBase: boolean;
}

export interface ScenarioSet {
  dealId: string;
  strategyId: string;
  base: FinancialInputs;
  assumptions: Assumption[];
  scenarios: Scenario[];
  version: number;
  updatedAt: string;
}

export interface RecomputeReport {
  changedPaths: string[];
  recomputed: Array<{ scenarioId: string; reason: string }>;
  skipped: Array<{ scenarioId: string; reason: string }>;
}
