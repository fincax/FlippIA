import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alerts, deals, watches } from "@/db/schema";
import { newId } from "@/modules/core/ids";
import type { TenantContext } from "../context";

export async function listAlerts(ctx: TenantContext, limit = 20) {
  return ctx.db
    .select()
    .from(alerts)
    .where(eq(alerts.organizationId, ctx.organizationId))
    .orderBy(desc(alerts.createdAt))
    .limit(limit);
}

export async function markAlertRead(ctx: TenantContext, id: string) {
  await ctx.db
    .update(alerts)
    .set({ readAt: new Date() })
    .where(and(eq(alerts.id, id), eq(alerts.organizationId, ctx.organizationId)));
}

export async function createAlert(
  ctx: TenantContext,
  input: {
    kind: string;
    severity: "info" | "opportunity" | "risk";
    title: string;
    body: string;
    dealId?: string;
    payload?: Record<string, unknown>;
  },
) {
  await ctx.db
    .insert(alerts)
    .values({
      id: newId("alr"),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      dealId: input.dealId ?? null,
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      body: input.body,
      payload: input.payload ?? {},
    });
}

export interface Pulse {
  greeting: string;
  unreadAlerts: number;
  opportunities: number;
  improved: number;
  attention: number;
  watched: number;
  lines: string[];
}

/** FlippIA Pulse: the "welcome back" summary. Every line maps to a reason the user can open. */
export async function pulse(ctx: TenantContext, now = new Date()): Promise<Pulse> {
  const hour = now.getHours();
  const greeting = hour < 13 ? "Buenos días." : hour < 20 ? "Buenas tardes." : "Buenas noches.";
  const unread = await ctx.db
    .select({ severity: alerts.severity, n: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(eq(alerts.organizationId, ctx.organizationId), isNull(alerts.readAt)))
    .groupBy(alerts.severity);
  const opportunities = unread.find((u) => u.severity === "opportunity")?.n ?? 0;
  const risks = unread.find((u) => u.severity === "risk")?.n ?? 0;
  const info = unread.find((u) => u.severity === "info")?.n ?? 0;
  const [w] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(watches)
    .where(and(eq(watches.organizationId, ctx.organizationId), eq(watches.status, "active")));
  const [analyzed] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(deals)
    .where(and(eq(deals.organizationId, ctx.organizationId), eq(deals.status, "analyzed")));
  const lines: string[] = [];
  if (opportunities)
    lines.push(`${opportunities} ${opportunities === 1 ? "oportunidad nueva" : "oportunidades nuevas"}.`);
  if (risks) lines.push(`${risks} ${risks === 1 ? "operación requiere" : "operaciones requieren"} atención.`);
  if (info) lines.push(`${info} ${info === 1 ? "aviso" : "avisos"}.`);
  if ((w?.n ?? 0) > 0) lines.push(`Vigilas ${w!.n} ${w!.n === 1 ? "activo" : "activos"}.`);
  if ((analyzed?.n ?? 0) > 0)
    lines.push(
      `${analyzed!.n} ${analyzed!.n === 1 ? "deal analizado" : "deals analizados"} en tu portfolio.`,
    );
  if (!lines.length)
    lines.push("Nada nuevo desde tu última visita. Dime una dirección o cuánto quieres invertir.");
  return {
    greeting,
    unreadAlerts: opportunities + risks + info,
    opportunities,
    improved: 0,
    attention: risks,
    watched: w?.n ?? 0,
    lines,
  };
}
