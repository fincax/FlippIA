import { and, eq } from "drizzle-orm";
import { scenarioSets } from "@/db/schema";
import {
  addCustomScenario,
  evaluateWhatIf,
  updateBase,
  type Overrides,
  type ScenarioSet,
} from "@/modules/engines/scenario";
import {
  applyToScenarioSet,
  isProfessionalInputKey,
  pickProfessionalInput,
  PROFESSIONAL_INPUT_REGISTRY,
} from "@/modules/inputs";
import { ForbiddenError, NotFoundError, requireRole, type TenantContext } from "../context";
import { getDeal, logActivity } from "./deals";
import { z } from "zod";

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);
const ROOTS = new Set(["acquisition", "transformation", "holding", "financing", "exit"]);

/** Override keys are dot paths inside FinancialInputs; never prototype keys, never outside the known roots. */
export const overridesSchema = z
  .record(
    z
      .string()
      .regex(/^[a-zA-Z0-9_.]{1,64}$/)
      .refine((k) => k.split(".").every((seg) => seg !== "" && !FORBIDDEN_SEGMENTS.has(seg)), "Unsafe path")
      .refine((k) => ROOTS.has(k.split(".")[0]!), "Unknown input path"),
    z.union([z.number().finite(), z.string().max(64), z.boolean()]),
  )
  .refine((o) => Object.keys(o).length <= 20, "Too many overrides");

export async function getScenarioSet(
  ctx: TenantContext,
  dealId: string,
  strategyId: string,
): Promise<ScenarioSet> {
  const [row] = await ctx.db
    .select()
    .from(scenarioSets)
    .where(
      and(
        eq(scenarioSets.organizationId, ctx.organizationId),
        eq(scenarioSets.dealId, dealId),
        eq(scenarioSets.strategyId, strategyId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Escenarios no encontrados");
  return row.set;
}

export async function listScenarioSets(ctx: TenantContext, dealId: string): Promise<ScenarioSet[]> {
  const rows = await ctx.db
    .select()
    .from(scenarioSets)
    .where(and(eq(scenarioSets.organizationId, ctx.organizationId), eq(scenarioSets.dealId, dealId)));
  return rows.map((r) => r.set);
}

/** The twin as readers see it: the stored set with the deal's professional inputs laid over it (never persisted). */
export async function getEffectiveScenarioSet(
  ctx: TenantContext,
  dealId: string,
  strategyId: string,
): Promise<ScenarioSet> {
  const deal = await getDeal(ctx, dealId);
  return applyToScenarioSet(await getScenarioSet(ctx, dealId, strategyId), deal.professionalInputs).result;
}

export async function listEffectiveScenarioSets(ctx: TenantContext, dealId: string): Promise<ScenarioSet[]> {
  const deal = await getDeal(ctx, dealId);
  return (await listScenarioSets(ctx, dealId)).map(
    (s) => applyToScenarioSet(s, deal.professionalInputs).result,
  );
}

/** Digital Investment Twin: update base assumptions, recompute only what changed. */
export async function updateScenarioBase(
  ctx: TenantContext,
  dealId: string,
  strategyId: string,
  changes: Overrides,
) {
  requireRole(ctx, "analyst");
  const parsed = overridesSchema.parse(changes);
  // A professional input outranks a twin hypothesis: changing it here would be silently masked.
  const deal = await getDeal(ctx, dealId);
  const governed = Object.keys(parsed).filter(
    (p) => isProfessionalInputKey(p) && pickProfessionalInput(deal.professionalInputs, p, strategyId),
  );
  if (governed.length)
    throw new ForbiddenError(
      `${governed.map((p) => (isProfessionalInputKey(p) ? PROFESSIONAL_INPUT_REGISTRY[p].label : p)).join(", ")}: hay un dato profesional activo. Edítalo o vuelve a la estimación desde Finanzas › Datos profesionales.`,
    );
  const set = await getScenarioSet(ctx, dealId, strategyId);
  const { set: next, report } = updateBase(set, parsed);
  await ctx.db
    .update(scenarioSets)
    .set({ set: next, version: next.version, updatedAt: new Date() })
    .where(
      and(
        eq(scenarioSets.organizationId, ctx.organizationId),
        eq(scenarioSets.dealId, dealId),
        eq(scenarioSets.strategyId, strategyId),
      ),
    );
  await logActivity(
    ctx,
    dealId,
    "scenario.base_updated",
    `Hipótesis actualizadas: ${Object.keys(changes).join(", ")}`,
    { strategyId, report },
  );
  return { set: next, report };
}

export async function createCustomScenario(
  ctx: TenantContext,
  dealId: string,
  strategyId: string,
  name: string,
  overrides: Overrides,
) {
  requireRole(ctx, "analyst");
  const set = await getScenarioSet(ctx, dealId, strategyId);
  const next = addCustomScenario(set, name.slice(0, 60), overridesSchema.parse(overrides));
  await ctx.db
    .update(scenarioSets)
    .set({ set: next, version: next.version, updatedAt: new Date() })
    .where(
      and(
        eq(scenarioSets.organizationId, ctx.organizationId),
        eq(scenarioSets.dealId, dealId),
        eq(scenarioSets.strategyId, strategyId),
      ),
    );
  await logActivity(ctx, dealId, "scenario.created", `Escenario «${name}» creado`, { strategyId });
  return next;
}

export async function whatIf(
  ctx: TenantContext,
  dealId: string,
  strategyId: string,
  overrides: Overrides,
  fromScenarioId?: string,
) {
  const set = await getEffectiveScenarioSet(ctx, dealId, strategyId);
  return evaluateWhatIf(set, overridesSchema.parse(overrides), fromScenarioId);
}
