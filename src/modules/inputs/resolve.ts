import { newId } from "@/modules/core/ids";
import { PROFESSIONAL_INPUT_REGISTRY, SOURCE_TYPE_META } from "./registry";
import type { ProfessionalInput, ProfessionalInputKey, ProfessionalSourceType } from "./types";

export function activeInputs(inputs: readonly ProfessionalInput[]): ProfessionalInput[] {
  return inputs.filter((i) => i.state === "active");
}

/** Whether an input applies to a strategy: deal-wide inputs apply to every strategy. */
export function appliesTo(input: ProfessionalInput, strategyId: string | undefined): boolean {
  return input.strategyId === undefined || input.strategyId === strategyId;
}

/**
 * The one professional input that governs a key for a strategy: active, in
 * scope, highest source rank, then most recent. The precedence between source
 * types lives here and nowhere else.
 */
export function pickProfessionalInput(
  inputs: readonly ProfessionalInput[],
  key: string,
  strategyId?: string,
): ProfessionalInput | null {
  const candidates = activeInputs(inputs).filter((i) => i.key === key && appliesTo(i, strategyId));
  if (!candidates.length) return null;
  return candidates.reduce((best, i) =>
    SOURCE_TYPE_META[i.sourceType].rank > SOURCE_TYPE_META[best.sourceType].rank ||
    (SOURCE_TYPE_META[i.sourceType].rank === SOURCE_TYPE_META[best.sourceType].rank &&
      i.enteredAt > best.enteredAt)
      ? i
      : best,
  );
}

export type EffectiveSource = "professional" | "manual_assumption" | "estimate" | "unknown";

export interface EffectiveValue {
  value: number | undefined;
  source: EffectiveSource;
  input?: ProfessionalInput;
}

/**
 * Central precedence rule:
 *   professional input (actual › document_verified › accepted_quote › contractor_quote › professional_confirmed)
 *   › manual assumption already in the twin base (`update_base`, source "user")
 *   › system estimate (engine / market / adapter / declared at intake)
 *   › UNKNOWN.
 * `fallback` is whatever the twin base currently holds for the key, with its origin.
 */
export function resolveEffectiveValue(params: {
  inputs: readonly ProfessionalInput[];
  key: string;
  strategyId?: string;
  fallback?: { value: number | undefined; source: "manual_assumption" | "estimate" };
}): EffectiveValue {
  const input = pickProfessionalInput(params.inputs, params.key, params.strategyId);
  if (input) return { value: input.value, source: "professional", input };
  if (params.fallback && params.fallback.value !== undefined)
    return { value: params.fallback.value, source: params.fallback.source };
  return { value: undefined, source: "unknown" };
}

export interface ProfessionalInputDraft {
  key: ProfessionalInputKey;
  strategyId?: string;
  value: number;
  sourceType: ProfessionalSourceType;
  enteredBy: string;
  enteredByName?: string;
  reason?: string;
  note?: string;
  breakdown?: ProfessionalInput["breakdown"];
  estimateAtEntry?: ProfessionalInput["estimateAtEntry"];
}

export function newProfessionalInput(draft: ProfessionalInputDraft, now = new Date()): ProfessionalInput {
  const def = PROFESSIONAL_INPUT_REGISTRY[draft.key];
  return {
    id: newId("pin"),
    key: draft.key,
    strategyId: def.scope === "strategy" ? draft.strategyId : undefined,
    value: draft.value,
    unit: def.unit,
    sourceType: draft.sourceType,
    status: SOURCE_TYPE_META[draft.sourceType].status,
    enteredBy: draft.enteredBy,
    enteredByName: draft.enteredByName,
    enteredAt: now.toISOString(),
    reason: draft.reason || undefined,
    note: draft.note || undefined,
    breakdown: draft.breakdown?.length ? draft.breakdown : undefined,
    estimateAtEntry: draft.estimateAtEntry,
    state: "active",
  };
}

/** Append a new entry; the previous active entry for the same key and scope is superseded, never deleted. */
export function setProfessionalInput(
  list: readonly ProfessionalInput[],
  input: ProfessionalInput,
): { list: ProfessionalInput[]; previous: ProfessionalInput | null } {
  let previous: ProfessionalInput | null = null;
  const next = list.map((i) => {
    if (i.state === "active" && i.key === input.key && i.strategyId === input.strategyId) {
      previous = i;
      return {
        ...i,
        state: "superseded" as const,
        endedAt: input.enteredAt,
        endedBy: input.enteredBy,
        endedReason: `Sustituido por ${input.id}`,
      };
    }
    return i;
  });
  return { list: [...next, input], previous };
}

/** Revert to the system value: the entry stays in the history as `reverted`. */
export function revertProfessionalInput(
  list: readonly ProfessionalInput[],
  key: ProfessionalInputKey,
  strategyId: string | undefined,
  by: string,
  reason?: string,
  now = new Date(),
): { list: ProfessionalInput[]; reverted: ProfessionalInput | null } {
  let reverted: ProfessionalInput | null = null;
  const next = list.map((i) => {
    if (i.state === "active" && i.key === key && i.strategyId === strategyId) {
      reverted = i;
      return {
        ...i,
        state: "reverted" as const,
        endedAt: now.toISOString(),
        endedBy: by,
        endedReason: reason || "Vuelta a la estimación",
      };
    }
    return i;
  });
  return { list: next, reverted };
}
