import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { alerts, watches, type WatchRule } from "@/db/schema";
import { newId } from "@/modules/core/ids";
import { eventBus } from "@/modules/core/events";
import { evaluateWatch } from "@/modules/watch/rules";
import { NotFoundError, requireRole, type TenantContext } from "../context";
import { getDeal, logActivity } from "./deals";
import { getInvestorDNA } from "./investor";
import { getListing } from "./radar";
import { z } from "zod";

export const watchRuleSchema = z.object({
  kind: z.enum([
    "price_below",
    "price_drop_pct",
    "regulation_change",
    "days_on_market",
    "meets_criteria",
    "new_comparable",
  ]),
  value: z.number().finite().optional(),
  note: z.string().max(200).optional(),
});

export async function createWatch(
  ctx: TenantContext,
  input: { dealId?: string; listingId?: string; label: string; rules: WatchRule[] },
) {
  requireRole(ctx, "analyst");
  const rules = z.array(watchRuleSchema).min(1).max(10).parse(input.rules);
  // Referenced records must be visible to this tenant.
  if (input.dealId) await getDeal(ctx, input.dealId);
  if (input.listingId && !(await getListing(ctx, input.listingId)))
    throw new NotFoundError("Listado no encontrado");
  const [row] = await ctx.db
    .insert(watches)
    .values({
      id: newId("wch"),
      organizationId: ctx.organizationId,
      dealId: input.dealId ?? null,
      listingId: input.listingId ?? null,
      userId: ctx.userId,
      label: input.label.slice(0, 120),
      rules,
    })
    .returning();
  await logActivity(ctx, input.dealId ?? null, "watch.created", `Vigilancia creada: ${row!.label}`, {
    rules,
  });
  return row!;
}

export async function listWatches(ctx: TenantContext) {
  return ctx.db
    .select()
    .from(watches)
    .where(eq(watches.organizationId, ctx.organizationId))
    .orderBy(desc(watches.createdAt))
    .limit(200);
}

export async function deleteWatch(ctx: TenantContext, id: string) {
  requireRole(ctx, "analyst");
  await ctx.db.delete(watches).where(and(eq(watches.id, id), eq(watches.organizationId, ctx.organizationId)));
}

/**
 * Scheduled Smart Watcher: evaluates the active watches of every organization,
 * grouped by the user who created them (Investor DNA is per user).
 */
export async function evaluateAllWatches(
  d: Database,
): Promise<{ organizations: number; evaluated: number; triggered: number }> {
  const groups = await d
    .selectDistinct({ organizationId: watches.organizationId, userId: watches.userId })
    .from(watches)
    .where(eq(watches.status, "active"));
  let evaluated = 0;
  let triggered = 0;
  for (const g of groups) {
    const ctx: TenantContext = { organizationId: g.organizationId, userId: g.userId, role: "analyst", db: d };
    const r = await evaluateWatches(ctx);
    evaluated += r.evaluated;
    triggered += r.triggered;
  }
  return { organizations: new Set(groups.map((g) => g.organizationId)).size, evaluated, triggered };
}

/** Smart Watcher pass: evaluate every active watch against current listing state; create alerts. */
export async function evaluateWatches(ctx: TenantContext): Promise<{ evaluated: number; triggered: number }> {
  const rows = await ctx.db
    .select()
    .from(watches)
    .where(and(eq(watches.organizationId, ctx.organizationId), eq(watches.status, "active")));
  const { dna } = await getInvestorDNA(ctx);
  let triggered = 0;
  for (const w of rows) {
    if (!w.listingId) continue;
    const listing = await getListing(ctx, w.listingId);
    if (!listing) continue;
    const ev = evaluateWatch(w.rules, listing, dna);
    await ctx.db
      .update(watches)
      .set({ lastEvaluatedAt: new Date(), status: ev.triggered ? "triggered" : "active" })
      .where(and(eq(watches.id, w.id), eq(watches.organizationId, ctx.organizationId)));
    if (ev.triggered) {
      triggered++;
      for (const e of ev.events) {
        await ctx.db.insert(alerts).values({
          id: newId("alr"),
          organizationId: ctx.organizationId,
          userId: w.userId,
          dealId: w.dealId,
          kind: `watch.${e.rule}`,
          severity: e.severity,
          title: e.title,
          body: e.body,
          payload: { watchId: w.id, listingId: w.listingId },
        });
      }
      await eventBus().emit({
        id: newId("evt"),
        name: "WatchTriggered",
        occurredAt: new Date().toISOString(),
        organizationId: ctx.organizationId,
        dealId: w.dealId ?? undefined,
        payload: { watchId: w.id, events: ev.events.length },
      });
    }
  }
  return { evaluated: rows.length, triggered };
}
