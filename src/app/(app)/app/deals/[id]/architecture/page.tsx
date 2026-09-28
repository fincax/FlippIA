import { NoAnalysis } from "@/components/flippia/no-analysis";
import { Badge, BarList, EvidenceBadge } from "@/components/ds";
import { BuildingVisual } from "@/components/flippia/visual/building-visual";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { labelChapter, labelCondition, labelFeasibility } from "@/lib/labels";
import { loadDeal } from "@/server/deal-page";

/**
 * SCREEN 05b — Architecture Lab.
 *
 *   PLAN / MODEL      STRATEGY
 *   PLAN / MODEL      COST
 *   PLAN / MODEL      VALUE
 *   PLAN / MODEL      REGULATION
 *
 * Left: the programme (current ↔ alternative) as a conceptual volume — FlippIA
 * holds no drawings, so the model is a diagram and says so. Right: the
 * alternative's strategy, cost, value and regulation, exactly as the
 * architecture module returned them.
 */
export default async function ArchitecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const a = analysis.architecture;
  const maxFloors = analysis.urbanism.planning.maxFloors;
  const cur = a.current;
  return (
    <div className="space-y-10">
      {/* ── WHAT IT IS ↔ WHAT IT COULD BE ───────────────────────────── */}
      <section className="frame border border-line bg-surface p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="kicker">Architecture lab</div>
            <h2 className="font-display text-xl md:text-2xl mt-1">Lo que es y lo que podría ser</h2>
          </div>
          <div className="flex items-center gap-3">
            <EvidenceBadge status={a.status} />
            <span className="kicker">confianza {Math.round(a.confidence.score * 100)} %</span>
          </div>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-stretch">
          <Programme
            kicker="Lo que es"
            title="Programa actual"
            areaM2={cur.areaM2}
            bedrooms={cur.bedrooms}
            bathrooms={cur.bathrooms}
            units={cur.units}
            note={labelCondition(cur.condition)}
            stage="current"
            maxFloors={maxFloors}
          />
          <div className="hidden md:grid place-items-center" aria-hidden>
            <div className="kicker rotate-90 whitespace-nowrap text-accent">transformación →</div>
          </div>
          {a.alternatives[0] ? (
            <Programme
              kicker="Lo que podría ser"
              title={a.alternatives[0].label}
              areaM2={a.alternatives[0].program.areaM2}
              bedrooms={a.alternatives[0].program.bedrooms}
              bathrooms={a.alternatives[0].program.bathrooms}
              units={a.alternatives[0].program.units}
              note={`obra ${a.alternatives[0].renovationLevel} · ${labelFeasibility(a.alternatives[0].feasibility)}`}
              stage="future"
              maxFloors={maxFloors}
              currentUnits={cur.units}
            />
          ) : (
            <div className="border border-dashed border-line p-5 text-sm text-fg-2">Sin alternativas.</div>
          )}
        </div>
        <p className="mt-4 text-[12px] text-fg-3">{a.confidence.factors.map((f) => f.note).join(" ")}</p>
      </section>

      {/* ── Alternatives: PLAN/MODEL · STRATEGY · COST · VALUE · REGULATION ── */}
      {a.alternatives.map((alt, i) => (
        <article
          key={alt.id}
          className="grid gap-px lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] bg-line border border-line"
        >
          <div className="bg-surface p-5 relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="kicker">Plan / model · {String(i + 1).padStart(2, "0")}</div>
                <h3 className="font-display text-lg md:text-xl mt-1 uppercase tracking-[0.02em]">
                  {alt.label}
                </h3>
              </div>
              <Badge
                tone={
                  alt.feasibility === "feasible"
                    ? "success"
                    : alt.feasibility === "conditional"
                      ? "warning"
                      : "danger"
                }
              >
                {labelFeasibility(alt.feasibility)}
              </Badge>
            </div>
            <BuildingVisual
              stage="transformation"
              floors={Math.max(1, Math.min(maxFloors ?? 3, 3))}
              maxFloors={maxFloors}
              units={cur.units}
              futureUnits={alt.program.units}
              className="mt-4 pb-6"
            />
            <dl className="grid grid-cols-4 gap-2 mt-2 text-[12px]">
              <Spec k="m²" v={String(alt.program.areaM2)} />
              <Spec k="dorm." v={String(alt.program.bedrooms)} />
              <Spec k="baños" v={String(alt.program.bathrooms)} />
              <Spec k="unid." v={String(alt.program.units)} />
            </dl>
          </div>
          <div className="bg-surface grid gap-px sm:grid-cols-2 bg-line">
            <Cell label="Strategy">
              <p className="text-[13px] text-fg-2">{alt.description}</p>
              {alt.notes.length ? (
                <ul className="mt-2 text-[12px] text-fg-3 list-disc pl-4 space-y-0.5">
                  {alt.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
            </Cell>
            <Cell label={`Cost · ${alt.estimate.stage}`}>
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-display text-xl num">{formatMoney(alt.estimate.contractBudget)}</span>
                <span className="kicker num">{alt.estimate.costPerM2} €/m²</span>
              </div>
              <BarList
                items={alt.estimate.byChapter.map((c) => ({
                  label: labelChapter(c.chapter),
                  value: c.amount,
                }))}
                format={(v) => formatMoney(v)}
              />
              <div className="kicker mt-2 normal-case tracking-normal">
                Biblioteca {alt.estimate.library} · confianza {Math.round(alt.estimate.confidence * 100)} % ·{" "}
                {alt.estimate.notes[0]}
              </div>
            </Cell>
            <Cell label="Value">
              <div className="font-display text-xl num text-accent">
                {alt.valueUplift ? `+${Math.round(alt.valueUplift * 100)} %` : "—"}
              </div>
              <div className="text-[12px] text-fg-3 mt-0.5">prima de valor sobre el valor reformado</div>
              <div className="mt-3 max-h-56 overflow-y-auto pr-1">
                <table className="w-full text-[12px]">
                  <caption className="sr-only">Partidas</caption>
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
            </Cell>
            <Cell label="Regulation">
              {alt.requiredChecks.length ? (
                <ul className="space-y-1.5 text-[12px]">
                  {alt.requiredChecks.map((c) => (
                    <li key={c.key} className="grid grid-cols-[10px_minmax(0,1fr)] gap-2">
                      <span
                        aria-hidden
                        className={cn("mt-1.5 size-1.5", c.blocking ? "bg-warning" : "border border-fg-3")}
                      />
                      <span>
                        <span className={c.blocking ? "text-warning" : "text-fg"}>{c.label}</span>
                        <span className="text-fg-3"> — {c.who}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-fg-3">Sin comprobaciones específicas para esta alternativa.</p>
              )}
            </Cell>
          </div>
        </article>
      ))}
    </div>
  );
}

function Programme({
  kicker,
  title,
  areaM2,
  bedrooms,
  bathrooms,
  units,
  note,
  stage,
  maxFloors,
  currentUnits,
}: {
  kicker: string;
  title: string;
  areaM2: number;
  bedrooms: number;
  bathrooms: number;
  units: number;
  note: string;
  stage: "current" | "future";
  maxFloors: number | null;
  currentUnits?: number;
}) {
  return (
    <div className={cn("border p-4 relative", stage === "future" ? "border-accent/50" : "border-line")}>
      <div className={cn("kicker", stage === "future" && "text-accent")}>{kicker}</div>
      <div className="font-display text-lg mt-1 text-fg">{title}</div>
      <BuildingVisual
        stage={stage}
        floors={Math.max(1, Math.min(maxFloors ?? 3, 3))}
        maxFloors={maxFloors}
        units={currentUnits ?? units}
        futureUnits={units}
        className="mt-3 pb-6"
      />
      <dl className="grid grid-cols-4 gap-2 mt-2 text-[12px]">
        <Spec k="m²" v={String(areaM2)} />
        <Spec k="dorm." v={String(bedrooms)} />
        <Spec k="baños" v={String(bathrooms)} />
        <Spec k="unid." v={String(units)} />
      </dl>
      <div className="kicker mt-3 normal-case tracking-normal">{note}</div>
    </div>
  );
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="kicker">{k}</dt>
      <dd className="font-display num text-lg text-fg">{v}</dd>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface p-4 md:p-5 min-w-0">
      <div className="kicker mb-2">{label}</div>
      {children}
    </div>
  );
}
