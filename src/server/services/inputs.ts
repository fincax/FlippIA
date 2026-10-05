import { and, eq } from "drizzle-orm";
import { deals, users } from "@/db/schema";
import type { AnalysisResult } from "@/modules/analysis/types";
import { eventBus } from "@/modules/core/events";
import { newId } from "@/modules/core/ids";
import { logger } from "@/modules/core/logger";
import {
  applyToAnalysis,
  newProfessionalInput,
  pickProfessionalInput,
  professionalInputRevertSchema,
  professionalInputSetSchema,
  PROFESSIONAL_INPUT_REGISTRY,
  PROFESSIONAL_INPUT_KEYS,
  revertProfessionalInput as revertInList,
  SOURCE_TYPE_META,
  setProfessionalInput as setInList,
  type ProfessionalInput,
  type ProfessionalInputDefinition,
  type ProfessionalInputRevertBody,
  type ProfessionalInputSetBody,
  type RejectedInput,
} from "@/modules/inputs";
import { getPath } from "@/modules/engines/scenario";
import type { EvidenceStatus } from "@/modules/core/evidence-status";
import { NotFoundError, requireRole, type TenantContext } from "../context";
import { getDeal, getStoredAnalysis, logActivity, summaryOf, type DealRow } from "./deals";
import { formatMoney } from "@/lib/format";

/** One editable slot: a deal-wide key, or a strategy-scoped key for one strategy. */
export interface ProfessionalInputItemView {
  key: ProfessionalInputDefinition["key"];
  label: string;
  unit: ProfessionalInputDefinition["unit"];
  scope: ProfessionalInputDefinition["scope"];
  strategyId?: string;
  strategyLabel?: string;
  /** The system value as stored in the analysis (never altered by professional inputs). */
  estimate: { value: number; label: string; status: EvidenceStatus; note?: string } | null;
  active: ProfessionalInput | null;
  effective: { value: number | null; source: "professional" | "manual_assumption" | "estimate" | "unknown" };
  /** Set when the active input could not be applied to the analysis. */
  error?: string;
}

export interface ProfessionalInputsView {
  hasAnalysis: boolean;
  items: ProfessionalInputItemView[];
  /** FlippIA's own maximum for the top strategy, to compare against a negotiated price. */
  maxPrice: { strategyLabel: string; maximumPrice: number; headroom: number } | null;
  history: ProfessionalInput[];
}

function estimateLabel(analysis: AnalysisResult, key: ProfessionalInputDefinition["key"]): string {
  if (key === "acquisition.purchasePrice")
    return {
      user: "Precio indicado en la petición",
      listing: "Precio del anuncio",
      estimated: "Estimación FlippIA (valor as-is sin reformar)",
    }[analysis.property.askingPriceSource];
  return "Estimación FlippIA";
}

function rejectionFor(rejected: RejectedInput[], input: ProfessionalInput | null): string | undefined {
  if (!input) return undefined;
  const r = rejected.find((x) => x.input.id === input.id);
  return r ? `No se ha podido aplicar este dato al análisis: ${r.reason}` : undefined;
}

/** What the UI needs to show estimate, professional value and the value in use, per slot. */
export async function professionalInputsView(
  ctx: TenantContext,
  dealId: string,
  stored: AnalysisResult | null,
): Promise<ProfessionalInputsView> {
  const deal = await getDeal(ctx, dealId);
  const inputs = deal.professionalInputs;
  const history = inputs
    .filter((i) => i.state !== "active")
    .sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""))
    .slice(0, 20);
  if (!stored) {
    return {
      hasAnalysis: false,
      items: [],
      maxPrice: null,
      history,
    };
  }
  const { result: effective, rejected } = applyToAnalysis(stored, inputs);
  const items: ProfessionalInputItemView[] = [];
  for (const key of PROFESSIONAL_INPUT_KEYS) {
    const def = PROFESSIONAL_INPUT_REGISTRY[key];
    const slots =
      def.scope === "deal"
        ? [{ strategy: stored.strategies[0], strategyId: undefined }]
        : stored.strategies.map((s) => ({ strategy: s, strategyId: s.id }));
    for (const slot of slots) {
      const s = slot.strategy;
      if (!s) continue;
      const assumption = s.scenarioSet.assumptions.find((a) => a.path === key);
      const current = getPath(s.scenarioSet.base, key);
      const estimate =
        typeof current === "number"
          ? {
              value: current,
              label: estimateLabel(stored, key),
              status: assumption?.status ?? "INFERRED",
              note: assumption?.note,
            }
          : null;
      const active = pickProfessionalInput(inputs, key, slot.strategyId);
      const error = rejectionFor(rejected, active);
      const effectiveStrategy = effective.strategies.find((x) => x.id === s.id);
      const used = effectiveStrategy ? getPath(effectiveStrategy.scenarioSet.base, key) : undefined;
      const value = typeof used === "number" ? used : null;
      items.push({
        key,
        label: def.label,
        unit: def.unit,
        scope: def.scope,
        strategyId: slot.strategyId,
        strategyLabel: def.scope === "strategy" ? s.label : undefined,
        estimate,
        active,
        effective: {
          value,
          source:
            active && !error
              ? "professional"
              : assumption?.source === "user"
                ? "manual_assumption"
                : value === null
                  ? "unknown"
                  : "estimate",
        },
        error,
      });
    }
  }
  const top = effective.strategies.find((s) => s.rank === 1) ?? effective.strategies[0];
  return {
    hasAnalysis: true,
    items,
    maxPrice:
      top?.maxPrice && top
        ? {
            strategyLabel: top.label,
            maximumPrice: top.maxPrice.maximumPrice,
            headroom: top.maxPrice.headroom,
          }
        : null,
    history,
  };
}

async function userName(ctx: TenantContext): Promise<string | undefined> {
  const [u] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, ctx.userId)).limit(1);
  return u?.name ?? undefined;
}

async function storedAnalysisFor(ctx: TenantContext, deal: DealRow): Promise<AnalysisResult | null> {
  return deal.latestAnalysisId ? getStoredAnalysis(ctx, deal.id) : null;
}

/** Persist the new list; refresh the deal summary so the list card shows the effective figures. */
async function saveInputs(
  ctx: TenantContext,
  dealId: string,
  list: ProfessionalInput[],
  stored: AnalysisResult | null,
): Promise<{ applied: number; rejected: RejectedInput[] }> {
  const report = stored ? applyToAnalysis(stored, list) : null;
  await ctx.db
    .update(deals)
    .set({
      professionalInputs: list,
      ...(report ? { summary: summaryOf(report.result) } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(deals.id, dealId), eq(deals.organizationId, ctx.organizationId)));
  for (const r of report?.rejected ?? [])
    logger.warn("professional_input.not_applied", {
      dealId,
      inputId: r.input.id,
      key: r.input.key,
      reason: r.reason,
    });
  return { applied: report?.applied.length ?? 0, rejected: report?.rejected ?? [] };
}

export interface ProfessionalInputChange {
  input: ProfessionalInput;
  previous: ProfessionalInput | null;
  estimate: { value: number; source: string } | null;
  applied: number;
  rejected: RejectedInput[];
}

/** Record a professional value. The previous entry for the slot is superseded, never deleted. */
export async function setProfessionalInput(
  ctx: TenantContext,
  dealId: string,
  body: ProfessionalInputSetBody,
): Promise<ProfessionalInputChange> {
  requireRole(ctx, "analyst");
  const data = professionalInputSetSchema.parse(body);
  const deal = await getDeal(ctx, dealId);
  const stored = await storedAnalysisFor(ctx, deal);
  const def = PROFESSIONAL_INPUT_REGISTRY[data.key];
  const strategy = stored?.strategies.find((s) => s.id === data.strategyId);
  if (def.scope === "strategy" && stored && !strategy)
    throw new NotFoundError("Estrategia no encontrada en el análisis");
  const ref = def.scope === "deal" ? stored?.strategies[0] : strategy;
  const current = ref ? getPath(ref.scenarioSet.base, data.key) : undefined;
  const assumption = ref?.scenarioSet.assumptions.find((a) => a.path === data.key);
  const estimate =
    typeof current === "number" ? { value: current, source: assumption?.source ?? "engine" } : null;
  const input = newProfessionalInput({
    key: data.key,
    strategyId: data.strategyId,
    value: data.value,
    sourceType: data.sourceType,
    enteredBy: ctx.userId,
    enteredByName: await userName(ctx),
    reason: data.reason,
    note: data.note,
    breakdown: data.breakdown,
    estimateAtEntry: estimate ? { ...estimate, analysisId: stored?.id } : undefined,
  });
  const { list, previous } = setInList(deal.professionalInputs, input);
  const { applied, rejected } = await saveInputs(ctx, dealId, list, stored);
  const scopeLabel = strategy ? ` · ${strategy.label}` : "";
  await logActivity(
    ctx,
    dealId,
    "input.professional_set",
    `${def.label}${scopeLabel}: ${estimate ? `${formatMoney(estimate.value)} estimado → ` : ""}${formatMoney(input.value)} (${SOURCE_TYPE_META[input.sourceType].label.toLowerCase()})`,
    {
      inputId: input.id,
      key: input.key,
      strategyId: input.strategyId ?? null,
      before: previous
        ? { value: previous.value, sourceType: previous.sourceType, inputId: previous.id }
        : estimate
          ? { value: estimate.value, source: estimate.source }
          : null,
      after: { value: input.value, sourceType: input.sourceType, status: input.status },
      reason: input.reason ?? null,
      applied,
      rejected: rejected.map((r) => ({ strategyId: r.strategyId ?? null, reason: r.reason })),
    },
  );
  await eventBus().emit({
    id: newId("evt"),
    name: "DealInputUpdated",
    occurredAt: input.enteredAt,
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    dealId,
    payload: {
      action: "set",
      key: input.key,
      strategyId: input.strategyId,
      value: input.value,
      sourceType: input.sourceType,
    },
  });
  return { input, previous, estimate, applied, rejected };
}

/** Back to the system value. The entry stays in the history as reverted. */
export async function revertProfessionalInput(
  ctx: TenantContext,
  dealId: string,
  body: ProfessionalInputRevertBody,
): Promise<{ reverted: ProfessionalInput }> {
  requireRole(ctx, "analyst");
  const data = professionalInputRevertSchema.parse(body);
  const deal = await getDeal(ctx, dealId);
  const { list, reverted } = revertInList(
    deal.professionalInputs,
    data.key,
    data.strategyId,
    ctx.userId,
    data.reason,
  );
  if (!reverted) throw new NotFoundError("No hay ningún dato profesional activo para ese concepto");
  const stored = await storedAnalysisFor(ctx, deal);
  await saveInputs(ctx, dealId, list, stored);
  const def = PROFESSIONAL_INPUT_REGISTRY[data.key];
  const strategy = stored?.strategies.find((s) => s.id === data.strategyId);
  await logActivity(
    ctx,
    dealId,
    "input.professional_reverted",
    `${def.label}${strategy ? ` · ${strategy.label}` : ""}: vuelve a la estimación${reverted.estimateAtEntry ? ` (${formatMoney(reverted.estimateAtEntry.value)})` : ""}`,
    {
      inputId: reverted.id,
      key: reverted.key,
      strategyId: reverted.strategyId ?? null,
      before: { value: reverted.value, sourceType: reverted.sourceType },
      after: reverted.estimateAtEntry
        ? { value: reverted.estimateAtEntry.value, source: reverted.estimateAtEntry.source }
        : null,
      reason: data.reason ?? null,
    },
  );
  await eventBus().emit({
    id: newId("evt"),
    name: "DealInputUpdated",
    occurredAt: new Date().toISOString(),
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    dealId,
    payload: { action: "revert", key: reverted.key, strategyId: reverted.strategyId, inputId: reverted.id },
  });
  return { reverted };
}
