import { and, desc, eq, sql } from "drizzle-orm";
import {
  activities,
  agentRuns,
  analyses,
  deals,
  evidence as evidenceTable,
  properties,
  regulatorySnapshots,
  scenarioSets,
} from "@/db/schema";
import type { AnalysisResult } from "@/modules/analysis/types";
import { eventBus } from "@/modules/core/events";
import { newId } from "@/modules/core/ids";
import type { IntakeRequest } from "@/modules/property/intake";
import { NotFoundError, requireRole, type TenantContext } from "../context";

export type DealRow = typeof deals.$inferSelect;

export async function createDeal(
  ctx: TenantContext,
  intake: IntakeRequest,
  title?: string,
): Promise<DealRow> {
  requireRole(ctx, "analyst");
  const id = newId("deal");
  const [row] = await ctx.db
    .insert(deals)
    .values({
      id,
      organizationId: ctx.organizationId,
      title: title ?? intake.property?.address ?? intake.rawText.slice(0, 80),
      status: "draft",
      askingPrice: intake.price ?? null,
      intake,
      createdBy: ctx.userId,
    })
    .returning();
  await logActivity(ctx, id, "deal.created", `Deal creado: ${row!.title}`);
  await eventBus().emit({
    id: newId("evt"),
    name: "DealCreated",
    occurredAt: new Date().toISOString(),
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    dealId: id,
    payload: { title: row!.title },
  });
  return row!;
}

export async function listDeals(ctx: TenantContext, limit = 50): Promise<DealRow[]> {
  return ctx.db
    .select()
    .from(deals)
    .where(eq(deals.organizationId, ctx.organizationId))
    .orderBy(desc(deals.updatedAt))
    .limit(limit);
}

export async function getDeal(ctx: TenantContext, dealId: string): Promise<DealRow> {
  const [row] = await ctx.db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row) throw new NotFoundError("Deal no encontrado");
  return row;
}

export async function updateDealStatus(
  ctx: TenantContext,
  dealId: string,
  status: DealRow["status"],
): Promise<void> {
  requireRole(ctx, "analyst");
  await getDeal(ctx, dealId);
  await ctx.db
    .update(deals)
    .set({
      status,
      mode: status === "project" || status === "acquired" ? "project" : "deal",
      updatedAt: new Date(),
    })
    .where(and(eq(deals.id, dealId), eq(deals.organizationId, ctx.organizationId)));
  await logActivity(ctx, dealId, "deal.status", `Estado: ${status}`);
}

export async function markAnalyzing(ctx: TenantContext, dealId: string): Promise<string> {
  const analysisId = newId("an");
  await ctx.db
    .insert(analyses)
    .values({
      id: analysisId,
      organizationId: ctx.organizationId,
      dealId,
      status: "running",
      analysisDate: new Date().toISOString().slice(0, 10),
    });
  await ctx.db
    .update(deals)
    .set({ status: "analyzing", updatedAt: new Date() })
    .where(and(eq(deals.id, dealId), eq(deals.organizationId, ctx.organizationId)));
  return analysisId;
}

export async function markAnalysisFailed(
  ctx: TenantContext,
  analysisId: string,
  dealId: string,
  error: string,
): Promise<void> {
  await ctx.db
    .update(analyses)
    .set({ status: "failed", error })
    .where(and(eq(analyses.id, analysisId), eq(analyses.organizationId, ctx.organizationId)));
  await ctx.db
    .update(deals)
    .set({ status: "draft", updatedAt: new Date() })
    .where(and(eq(deals.id, dealId), eq(deals.organizationId, ctx.organizationId)));
}

/** Persist a completed analysis: result, agent runs, evidence, regulatory snapshot, scenario sets, property. */
export async function persistAnalysis(
  ctx: TenantContext,
  analysisId: string,
  dealId: string,
  result: AnalysisResult,
): Promise<void> {
  const stored: AnalysisResult = { ...result, id: analysisId, dealId };
  const p = result.property.property;
  await ctx.db.transaction(async (tx) => {
    const propertyId = p.id;
    await tx
      .insert(properties)
      .values({
        id: propertyId,
        organizationId: ctx.organizationId,
        cityId: p.cityId,
        microzoneId: p.microzoneId ?? null,
        cadastralRef: p.cadastralRef ?? null,
        address: p.address.raw,
        location: p.coordinates ? { x: p.coordinates.lng, y: p.coordinates.lat } : null,
        data: p,
        demo: p.demo,
      })
      .onConflictDoNothing();
    await tx
      .update(analyses)
      .set({
        status: "completed",
        result: stored,
        durationMs: result.durationMs,
        analysisDate: result.analysisDate,
      })
      .where(and(eq(analyses.id, analysisId), eq(analyses.organizationId, ctx.organizationId)));
    await tx
      .update(deals)
      .set({
        status: "analyzed",
        propertyId,
        latestAnalysisId: analysisId,
        askingPrice: result.property.askingPrice,
        title: `${p.address.raw} · ${result.property.microzone.name}`,
        summary: {
          headline: result.synthesis.headline,
          topStrategy: result.strategies[0]?.label ?? null,
          netProfit: result.strategies[0]?.headline.netProfit ?? null,
          roe: result.strategies[0]?.headline.roe ?? null,
          dna: result.dna.composite.score,
          gap: result.gap.gap,
          risk: result.risk.overall,
          demo: result.demo,
          strategies: result.strategies.length,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(deals.id, dealId), eq(deals.organizationId, ctx.organizationId)));
    if (result.agentRuns.length) {
      await tx
        .insert(agentRuns)
        .values(
          result.agentRuns.map((r) => ({
            id: r.id,
            organizationId: ctx.organizationId,
            analysisId,
            dealId,
            agentType: r.agentType,
            domain: r.domain,
            label: r.label,
            parentRunId: r.parentRunId ?? null,
            orchestratorRunId: r.orchestratorRunId,
            status: r.status,
            record: { ...r, analysisId, dealId },
            latencyMs: r.latencyMs,
            startedAt: new Date(r.startedAt),
            completedAt: r.completedAt ? new Date(r.completedAt) : null,
          })),
        );
    }
    if (result.evidence.length) {
      await tx
        .insert(evidenceTable)
        .values(
          result.evidence.map((e) => ({
            id: e.id,
            organizationId: ctx.organizationId,
            dealId,
            analysisId,
            sourceType: e.sourceType,
            sourceId: e.sourceId,
            verificationStatus: e.verificationStatus,
            demo: e.demo,
            record: e,
            retrievedAt: new Date(e.retrievedAt),
          })),
        );
    }
    await tx
      .insert(regulatorySnapshots)
      .values({
        id: result.regulatory.id,
        organizationId: ctx.organizationId,
        dealId,
        analysisId,
        analysisDate: result.regulatory.analysisDate,
        fingerprint: result.regulatory.fingerprint,
        snapshot: result.regulatory,
      });
    await tx
      .delete(scenarioSets)
      .where(and(eq(scenarioSets.dealId, dealId), eq(scenarioSets.organizationId, ctx.organizationId)));
    if (result.strategies.length) {
      await tx
        .insert(scenarioSets)
        .values(
          result.strategies.map((s) => ({
            id: newId("sset"),
            organizationId: ctx.organizationId,
            dealId,
            strategyId: s.id,
            set: { ...s.scenarioSet, dealId },
            version: 1,
          })),
        );
    }
    await tx
      .insert(activities)
      .values({
        id: newId("act"),
        organizationId: ctx.organizationId,
        dealId,
        userId: ctx.userId,
        kind: "analysis.completed",
        title: result.synthesis.headline,
        payload: { analysisId, strategies: result.strategies.length, demo: result.demo },
      });
  });
  await eventBus().emit({
    id: newId("evt"),
    name: "AnalysisCompleted",
    occurredAt: new Date().toISOString(),
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    dealId,
    payload: { analysisId },
  });
}

export async function getLatestAnalysis(ctx: TenantContext, dealId: string): Promise<AnalysisResult | null> {
  const deal = await getDeal(ctx, dealId);
  if (!deal.latestAnalysisId) return null;
  const [row] = await ctx.db
    .select({ result: analyses.result })
    .from(analyses)
    .where(and(eq(analyses.id, deal.latestAnalysisId), eq(analyses.organizationId, ctx.organizationId)))
    .limit(1);
  return row?.result ?? null;
}

export async function listDealActivity(ctx: TenantContext, dealId: string, limit = 30) {
  return ctx.db
    .select()
    .from(activities)
    .where(and(eq(activities.dealId, dealId), eq(activities.organizationId, ctx.organizationId)))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}

export async function logActivity(
  ctx: TenantContext,
  dealId: string | null,
  kind: string,
  title: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await ctx.db
    .insert(activities)
    .values({
      id: newId("act"),
      organizationId: ctx.organizationId,
      dealId,
      userId: ctx.userId,
      kind,
      title,
      payload,
    });
}

export async function dealCounts(ctx: TenantContext): Promise<Record<string, number>> {
  const rows = await ctx.db
    .select({ status: deals.status, n: sql<number>`count(*)::int` })
    .from(deals)
    .where(eq(deals.organizationId, ctx.organizationId))
    .groupBy(deals.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
