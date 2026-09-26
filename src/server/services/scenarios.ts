import { and, eq } from "drizzle-orm";
import { scenarioSets } from "@/db/schema";
import { addCustomScenario, evaluateWhatIf, updateBase, type Overrides, type ScenarioSet } from "@/modules/engines/scenario";
import { NotFoundError, requireRole, type TenantContext } from "../context";
import { logActivity } from "./deals";
import { z } from "zod";

export const overridesSchema = z.record(z.string().regex(/^[a-zA-Z0-9_.]{1,64}$/), z.union([z.number().finite(), z.string().max(64), z.boolean()])).refine((o) => Object.keys(o).length <= 20, "Too many overrides");

export async function getScenarioSet(ctx: TenantContext, dealId: string, strategyId: string): Promise<ScenarioSet> {
  const [row] = await ctx.db.select().from(scenarioSets).where(and(eq(scenarioSets.organizationId, ctx.organizationId), eq(scenarioSets.dealId, dealId), eq(scenarioSets.strategyId, strategyId))).limit(1);
  if (!row) throw new NotFoundError("Escenarios no encontrados");
  return row.set;
}

export async function listScenarioSets(ctx: TenantContext, dealId: string): Promise<ScenarioSet[]> {
  const rows = await ctx.db.select().from(scenarioSets).where(and(eq(scenarioSets.organizationId, ctx.organizationId), eq(scenarioSets.dealId, dealId)));
  return rows.map((r) => r.set);
}

/** Digital Investment Twin: update base assumptions, recompute only what changed. */
export async function updateScenarioBase(ctx: TenantContext, dealId: string, strategyId: string, changes: Overrides) {
  requireRole(ctx, "analyst");
  const set = await getScenarioSet(ctx, dealId, strategyId);
  const { set: next, report } = updateBase(set, overridesSchema.parse(changes));
  await ctx.db.update(scenarioSets).set({ set: next, version: next.version, updatedAt: new Date() }).where(and(eq(scenarioSets.organizationId, ctx.organizationId), eq(scenarioSets.dealId, dealId), eq(scenarioSets.strategyId, strategyId)));
  await logActivity(ctx, dealId, "scenario.base_updated", `Hipótesis actualizadas: ${Object.keys(changes).join(", ")}`, { strategyId, report });
  return { set: next, report };
}

export async function createCustomScenario(ctx: TenantContext, dealId: string, strategyId: string, name: string, overrides: Overrides) {
  requireRole(ctx, "analyst");
  const set = await getScenarioSet(ctx, dealId, strategyId);
  const next = addCustomScenario(set, name.slice(0, 60), overridesSchema.parse(overrides));
  await ctx.db.update(scenarioSets).set({ set: next, version: next.version, updatedAt: new Date() }).where(and(eq(scenarioSets.organizationId, ctx.organizationId), eq(scenarioSets.dealId, dealId), eq(scenarioSets.strategyId, strategyId)));
  await logActivity(ctx, dealId, "scenario.created", `Escenario «${name}» creado`, { strategyId });
  return next;
}

export async function whatIf(ctx: TenantContext, dealId: string, strategyId: string, overrides: Overrides, fromScenarioId?: string) {
  const set = await getScenarioSet(ctx, dealId, strategyId);
  return evaluateWhatIf(set, overridesSchema.parse(overrides), fromScenarioId);
}
