import { ScenarioPanel } from "@/components/flippia/scenario-panel";
import { loadDeal } from "@/server/deal-page";
import { listScenarioSets } from "@/server/services/scenarios";

export default async function ScenariosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, analysis } = await loadDeal(id);
  if (!analysis) return null;
  const sets = await listScenarioSets(ctx, id);
  const ordered = analysis.strategies
    .map((s) => ({
      strategy: { id: s.id, label: s.label, rank: s.rank },
      set: sets.find((x) => x.strategyId === s.id),
    }))
    .filter(
      (x): x is { strategy: { id: string; label: string; rank: number }; set: NonNullable<typeof x.set> } =>
        Boolean(x.set),
    );
  return <ScenarioPanel dealId={id} items={ordered} />;
}
