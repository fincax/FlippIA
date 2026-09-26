import { NoAnalysis } from "@/components/flippia/no-analysis";
import { Badge, BarList, EvidenceBadge, SectionTitle, Surface } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import { loadDeal } from "@/server/deal-page";

export default async function ArchitecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const a = analysis.architecture;
  return (
    <div className="space-y-6">
      <Surface className="p-5">
        <SectionTitle kicker="Architecture Orchestrator" right={<EvidenceBadge status={a.status} />}>
          Programa actual
        </SectionTitle>
        <div className="text-sm text-fg-2">
          {a.current.areaM2} m² · {a.current.bedrooms} dormitorios · {a.current.bathrooms} baños · estado{" "}
          {a.current.condition}. Confianza {Math.round(a.confidence.score * 100)} %:{" "}
          {a.confidence.factors.map((f) => f.note).join(" ")}
        </div>
      </Surface>
      {a.alternatives.map((alt) => (
        <Surface key={alt.id} className="p-5">
          <SectionTitle
            kicker={`Alternativa · ${alt.renovationLevel}`}
            right={
              <Badge
                tone={
                  alt.feasibility === "feasible"
                    ? "success"
                    : alt.feasibility === "conditional"
                      ? "warning"
                      : "danger"
                }
              >
                {alt.feasibility}
              </Badge>
            }
          >
            {alt.label}
          </SectionTitle>
          <p className="text-sm text-fg-2">
            {alt.description} Programa: {alt.program.bedrooms} dorm., {alt.program.bathrooms} baños,{" "}
            {alt.program.units} unidad(es).{" "}
            {alt.valueUplift ? `Prima de valor: +${Math.round(alt.valueUplift * 100)} %.` : ""}
          </p>
          <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] uppercase tracking-[0.12em] text-fg-3">
                  Presupuesto ({alt.estimate.stage})
                </span>
                <span className="font-display text-xl num">
                  {formatMoney(alt.estimate.contractBudget)}{" "}
                  <span className="text-[12px] text-fg-3">· {alt.estimate.costPerM2} €/m²</span>
                </span>
              </div>
              <BarList
                items={alt.estimate.byChapter.map((c) => ({ label: c.chapter, value: c.amount }))}
                format={(v) => formatMoney(v)}
              />
              <div className="mt-2 text-[11px] text-fg-3">
                Biblioteca {alt.estimate.library} · confianza {Math.round(alt.estimate.confidence * 100)} % ·{" "}
                {alt.estimate.notes[0]}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3 mb-2">Partidas</div>
              <div className="max-h-72 overflow-y-auto pr-1">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <tbody>
                      {alt.estimate.lines.map((l) => (
                        <tr key={l.id} className="border-t border-line">
                          <td className="py-1 pr-2">{l.label}</td>
                          <td className="py-1 pr-2 num text-fg-3 whitespace-nowrap">
                            {l.quantity} {l.unit} × {l.unitCost} €
                          </td>
                          <td className="py-1 num text-right whitespace-nowrap">{formatMoney(l.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {alt.requiredChecks.length ? (
                <ul className="mt-3 text-[12px] text-warning list-disc pl-4">
                  {alt.requiredChecks.map((c) => (
                    <li key={c.key}>
                      {c.label} — {c.who}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </Surface>
      ))}
    </div>
  );
}
