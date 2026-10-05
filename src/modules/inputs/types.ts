import type { EvidenceStatus } from "@/modules/core/evidence-status";

/**
 * Professional inputs: values a professional knows better than the system
 * estimates them (a negotiated purchase price, a contractor's budget). They
 * never replace the estimate: both are kept and the effective value is
 * resolved centrally (`resolveEffectiveValue`).
 */

/** Keys are dot paths inside `FinancialInputs`, the same contract the Digital Twin uses. */
export const PROFESSIONAL_INPUT_KEYS = [
  "acquisition.purchasePrice",
  "transformation.renovationBudget",
] as const;
export type ProfessionalInputKey = (typeof PROFESSIONAL_INPUT_KEYS)[number];

/** From least to most authoritative. A manual what-if hypothesis is a scenario input, not a professional input. */
export const PROFESSIONAL_SOURCE_TYPES = [
  "professional_confirmed",
  "contractor_quote",
  "accepted_quote",
  "document_verified",
  "actual",
] as const;
export type ProfessionalSourceType = (typeof PROFESSIONAL_SOURCE_TYPES)[number];

export type ProfessionalInputUnit = "currency" | "ratio" | "months" | "number";

/** `deal`: applies to every strategy. `strategy`: each strategy has its own value (its own works). */
export type ProfessionalInputScope = "deal" | "strategy";

export interface ProfessionalInputBreakdownLine {
  label: string;
  amount: number;
}

export interface ProfessionalInput {
  id: string;
  key: ProfessionalInputKey;
  /** Required for strategy-scoped keys; absent for deal-wide keys. */
  strategyId?: string;
  value: number;
  unit: ProfessionalInputUnit;
  sourceType: ProfessionalSourceType;
  /** Evidence status derived from the source type at entry time. */
  status: EvidenceStatus;
  enteredBy: string;
  enteredByName?: string;
  enteredAt: string;
  reason?: string;
  note?: string;
  /** Optional detail (materials, labour…) whose sum is the value. */
  breakdown?: ProfessionalInputBreakdownLine[];
  /** The estimate in force when the value was entered (audit and learning); the live estimate is read from the analysis. */
  estimateAtEntry?: { value: number; source: string; analysisId?: string };
  /** Active until superseded by a newer entry for the same key and scope, or reverted to the estimate. */
  state: "active" | "superseded" | "reverted";
  endedAt?: string;
  endedBy?: string;
  endedReason?: string;
}

export interface ProfessionalInputDefinition {
  key: ProfessionalInputKey;
  label: string;
  unit: ProfessionalInputUnit;
  scope: ProfessionalInputScope;
  description: string;
}
