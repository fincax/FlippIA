import Link from "next/link";
import { Surface } from "@/components/ds";
import type { DealRow } from "@/server/services/deals";

/** Shared empty state for Deal Room tabs when the deal has no completed analysis. */
export function NoAnalysis({ deal }: { deal: DealRow }) {
  const analyzing = deal.status === "analyzing";
  return (
    <Surface className="p-8 text-center">
      <div className="font-display text-xl">Este deal todavía no tiene análisis.</div>
      <p className="text-sm text-fg-2 mt-2">
        {analyzing ? "LIA está construyendo el caso." : "Lanza el análisis para que LIA construya el caso."}
      </p>
      <Link
        href={`/app/analyze?q=${encodeURIComponent(deal.intake.rawText)}&deal=${deal.id}`}
        className="inline-block mt-4 rounded-[var(--radius-md)] bg-accent text-bg px-4 py-2 text-sm font-medium"
      >
        {analyzing ? "Ver el progreso" : "Construir el caso"}
      </Link>
    </Surface>
  );
}
