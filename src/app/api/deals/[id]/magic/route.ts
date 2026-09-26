import { handle, jsonError, jsonOk } from "@/lib/api";
import { discoverPotential } from "@/modules/analysis/magic";
import { requireMutation } from "@/server/auth/current";
import { getLatestAnalysis, logActivity } from "@/server/services/deals";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { ctx } = await requireMutation();
  const { id } = await params;
  const analysis = await getLatestAnalysis(ctx, id);
  if (!analysis) return jsonError("NO_ANALYSIS", "Este deal todavía no tiene análisis.", 409);
  const report = discoverPotential(analysis);
  await logActivity(ctx, id, "magic.run", report.headline, { improvements: report.improvements.length });
  return jsonOk(report);
});
