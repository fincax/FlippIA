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
  /** Net amount of the line, before commercial margin. */
  amount: number;
  /** Commercial margin applied to this line (0..1). Falls back to the input's margin. */
  marginRate?: number;
}

/**
 * Who answers for the figure. FlippIA estimates the market; a final budget is
 * the responsibility of the professional or technician who issues it.
 */
export interface ProfessionalInputIssuer {
  kind: "self" | "technician";
  /** Technician, firm or contractor that issued the figure. */
  name?: string;
}

export interface ProfessionalInput {
  id: string;
  key: ProfessionalInputKey;
  /** Required for strategy-scoped keys; absent for deal-wide keys. */
  strategyId?: string;
  /** The figure the analysis uses: net value plus commercial margin. */
  value: number;
  /** As entered, before commercial margin. */
  netValue: number;
  /** Commercial margin applied by default to the input (0..1); lines may override it. */
  marginRate?: number;
  /** value − netValue. */
  marginAmount: number;
  unit: ProfessionalInputUnit;
  sourceType: ProfessionalSourceType;
  /** Evidence status derived from the source type at entry time. */
  status: EvidenceStatus;
  enteredBy: string;
  enteredByName?: string;
  enteredAt: string;
  issuer: ProfessionalInputIssuer;
  /** When the person entering the figure accepted that it is provided under their responsibility. */
  responsibilityAcknowledgedAt: string;
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
