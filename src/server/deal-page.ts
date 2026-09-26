import { notFound } from "next/navigation";
import type { AnalysisResult } from "@/modules/analysis/types";
import { tenantContext } from "@/server/auth/current";
import { NotFoundError } from "@/server/context";
import { getDeal, getLatestAnalysis, type DealRow } from "@/server/services/deals";
import type { TenantContext } from "@/server/context";

/** Shared loader for Deal Room pages. */
export async function loadDeal(
  id: string,
): Promise<{ ctx: TenantContext; deal: DealRow; analysis: AnalysisResult | null }> {
  const { ctx } = await tenantContext();
  try {
    const deal = await getDeal(ctx, id);
    const analysis = await getLatestAnalysis(ctx, id);
    return { ctx, deal, analysis };
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

export function topStrategy(analysis: AnalysisResult) {
  return analysis.strategies.find((s) => s.rank === 1) ?? analysis.strategies[0] ?? null;
}
