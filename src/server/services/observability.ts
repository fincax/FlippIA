import { and, desc, eq, gte, sql } from "drizzle-orm";
import { agentRuns } from "@/db/schema";
import type { TenantContext } from "../context";

/** Internal agent observability panel data. */
export async function agentStats(ctx: TenantContext, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const byAgent = await ctx.db
    .select({
      agentType: agentRuns.agentType,
      domain: agentRuns.domain,
      runs: sql<number>`count(*)::int`,
      failures: sql<number>`sum(case when ${agentRuns.status} in ('failed','timeout') then 1 else 0 end)::int`,
      avgLatency: sql<number>`avg(${agentRuns.latencyMs})::int`,
      tools: sql<number>`sum(jsonb_array_length(coalesce(${agentRuns.record}->'toolCalls','[]'::jsonb)))::int`,
      evidence: sql<number>`sum(jsonb_array_length(coalesce(${agentRuns.record}->'evidenceIds','[]'::jsonb)))::int`,
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.organizationId, ctx.organizationId), gte(agentRuns.startedAt, since)))
    .groupBy(agentRuns.agentType, agentRuns.domain)
    .orderBy(desc(sql`count(*)`));
  const recent = await ctx.db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.organizationId, ctx.organizationId))
    .orderBy(desc(agentRuns.startedAt))
    .limit(40);
  return { byAgent, recent };
}
