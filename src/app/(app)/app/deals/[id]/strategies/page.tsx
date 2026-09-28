import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { labelConstraint } from "@/lib/labels";
import { NoAnalysis } from "@/components/flippia/no-analysis";
import { Badge, EvidenceBadge, FinancialMetric, Money, Pct } from "@/components/ds";
import { FutureNode } from "@/components/flippia/visual/future-tree";
import { StressGauge } from "@/components/flippia/visual/stress-gauge";
import { cn } from "@/lib/cn";
import { loadDeal } from "@/server/deal-page";

/**
 * SCREEN 04 — Investment Future. The strategies MultiExit already computed,
 * presented as futures: first the decision layer (capital, plazo, retorno,
 * riesgo, complejidad), then the technical layer. All numbers from the engines.
 */
export default async function StrategiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const all = analysis.strategies;
  const futures = all.filter((s) => s.applicability.applicable);
  const discarded = all.filter((s) => !s.applicability.applicable);
  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <div className="kicker">Comparar futuros</div>
            <h2 className="font-display text-2xl md:text-3xl mt-1">
              {futures.length} {futures.length === 1 ? "futuro" : "futuros"} para el mismo activo
            </h2>
          </div>
          <p className="text-[13px] text-fg-2 max-w-xl">
            Cada activo se estudia con todas las estrategias compatibles (MultiExit). Ninguna se presenta como
            viable sin validación: las condicionadas muestran sus comprobaciones. El orden explica sus
            motivos.
          </p>
        </div>

        {/* ── decision layer: the comparison matrix ───────────────────── */}
        <div className="frame border border-line bg-surface overflow-x-auto">
          <table className="w-full text-[13px] min-w-[720px]">
            <caption className="sr-only">Comparación de futuros</caption>
            <thead>
              <tr className="kicker text-left border-b border-line">
                <th className="font-normal px-4 py-3">Futuro</th>
                <th className="font-normal px-4 py-3 text-right">Capital</th>
                <th className="font-normal px-4 py-3 text-right">Plazo</th>
                <th className="font-normal px-4 py-3 text-right">Retorno</th>
                <th className="font-normal px-4 py-3 text-right">Riesgo</th>
                <th className="font-normal px-4 py-3 text-right">Complejidad</th>
                <th className="font-normal px-4 py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {futures.map((s, i) => {
                const sale = s.exitKind === "sale";
                const survival = s.stress?.survivalRate ?? null;
                const checks = s.applicability.requiredChecks.length;
                return (
                  <tr
                    key={s.id}
                    className={cn("border-b border-line last:border-0", i === 0 && "bg-accent-soft/40")}
                  >
                    <td className="px-4 py-3">
                      <a href={`#${s.id}`} className="flex items-baseline gap-3 hover:text-accent">
                        <span className={cn("kicker num", i === 0 ? "text-accent" : undefined)}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="font-display uppercase tracking-[0.03em] text-fg">{s.label}</span>
                        {s.applicability.conditional ? (
                          <span className="kicker text-warning">cond.</span>
                        ) : null}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right num">
                      <Money value={s.headline.equityRequired} />
                    </td>
                    <td className="px-4 py-3 text-right num">{s.headline.durationMonths} m</td>
                    <td className="px-4 py-3 text-right num">
                      {sale ? (
                        <>
                          <Money value={s.headline.netProfit} signed />
                          <span className="block text-[11px] text-fg-3">
                            ROE <Pct value={s.headline.roe} />
                          </span>
                        </>
                      ) : (
                        <>
                          <Money value={s.headline.monthlyRent} />
                          <span className="block text-[11px] text-fg-3">
                            /mes · TIR <Pct value={s.headline.irr} />
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {survival !== null ? (
                        <span className="inline-flex items-center gap-2 justify-end">
                          <span className="h-1.5 w-16 bg-bg-2 overflow-hidden" aria-hidden>
                            <span
                              className={cn(
                                "block h-full",
                                survival >= 0.7
                                  ? "bg-verified"
                                  : survival >= 0.4
                                    ? "bg-warning"
                                    : "bg-danger",
                              )}
                              style={{ width: `${Math.round(survival * 100)}%` }}
                            />
                          </span>
                          <span className="num text-[12px]">{Math.round(survival * 100)} %</span>
                        </span>
                      ) : (
                        <span className="text-fg-3">n/d</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-[11px] tracking-[0.1em] text-fg-2">
                        {checks === 0 ? "sin bloqueos" : `${checks} comprob.`}
                        <span className="text-fg-3"> · obra {s.transformation.level}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-display num text-fg">{s.score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── technical layer: one future at a time ──────────────────────── */}
      <section className="space-y-8">
        {all.map((s, i) => {
          const base = s.scenarioSet.scenarios.find((x) => x.kind === "base")?.result;
          return (
            <article key={s.id} id={s.id} className="scroll-mt-24">
              <FutureNode strategy={s} index={i} href={`#${s.id}`} compact selected={i === 0} />
              <div className="border border-t-0 border-line bg-bg-2/40 p-5 md:p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-sm text-fg-2 max-w-2xl">{s.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>{s.family}</Badge>
                    <Badge>{s.exitKind === "sale" ? "venta" : "alquiler"}</Badge>
                    <Badge>obra: {s.transformation.level}</Badge>
                    {s.applicability.conditional ? (
                      <Badge tone="warning">condicionada</Badge>
                    ) : s.applicability.applicable ? (
                      <Badge tone="success">sin bloqueos</Badge>
                    ) : (
                      <Badge tone="danger">no aplicable</Badge>
                    )}
                  </div>
                </div>

                {base ? (
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 border-y border-line py-4">
                    <FinancialMetric label="Beneficio neto" metric={base.metrics.netProfit} size="sm" />
                    <FinancialMetric label="ROE" metric={base.metrics.roe} size="sm" />
                    <FinancialMetric label="TIR" metric={base.metrics.irr} size="sm" />
                    <FinancialMetric label="Capital" metric={base.metrics.equityRequired} size="sm" />
                    <FinancialMetric label="Coste total" metric={base.metrics.totalProjectCost} size="sm" />
                    <FinancialMetric label="Duración" metric={base.metrics.durationMonths} size="sm" />
                  </div>
                ) : null}

                <div className="grid gap-6 md:grid-cols-3">
                  <div>
                    <div className="kicker mb-2">Por qué en esta posición</div>
                    <ol className="text-[13px] text-fg-2 space-y-1.5">
                      {s.whyRanked.map((w, k) => (
                        <li key={`${k}-${w}`} className="grid grid-cols-[22px_minmax(0,1fr)] gap-1.5">
                          <span className="kicker num">{String(k + 1).padStart(2, "0")}</span>
                          {w}
                        </li>
                      ))}
                    </ol>
                    <div className="kicker mt-4 mb-2">Motivos de aplicabilidad</div>
                    <ul className="text-[13px] text-fg-2 space-y-1 list-disc pl-4">
                      {s.applicability.reasons.map((w, k) => (
                        <li key={`${k}-${w}`}>{w}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="kicker mb-2">Comprobaciones requeridas</div>
                    {s.applicability.requiredChecks.length ? (
                      <ul className="space-y-2">
                        {s.applicability.requiredChecks.map((c) => (
                          <li key={c.key} className="text-[13px] grid grid-cols-[12px_minmax(0,1fr)] gap-2">
                            <span
                              aria-hidden
                              className={cn(
                                "mt-1.5 size-1.5",
                                c.blocking ? "bg-warning" : "border border-fg-3",
                              )}
                            />
                            <span>
                              <span className={c.blocking ? "text-warning" : "text-fg"}>{c.label}</span>
                              <span className="text-fg-3">
                                {" "}
                                — {c.who}. {c.why}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13px] text-fg-3">Ninguna comprobación bloqueante.</p>
                    )}
                    {s.maxPrice ? (
                      <div className="mt-4 text-[13px] text-fg-2">
                        <div className="kicker mb-1">Precio máximo para tus objetivos</div>
                        <span className="font-display text-lg num text-fg">
                          <Money value={s.maxPrice.maximumPrice} />
                        </span>{" "}
                        <span className="text-fg-3">({labelConstraint(s.maxPrice.bindingConstraint)})</span>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="kicker mb-2">Estrés</div>
                    {s.stress ? (
                      <StressGauge
                        survivalRate={s.stress.survivalRate}
                        capitalAtRisk={s.stress.capitalAtRisk}
                        marginOfSafety={s.stress.marginOfSafety}
                      />
                    ) : (
                      <p className="text-[13px] text-fg-3">Sin informe de estrés para esta vía.</p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="kicker mb-2">Hipótesis</div>
                  <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 text-[12px] bg-line border border-line">
                    {s.scenarioSet.assumptions.map((a) => (
                      <div
                        key={a.path}
                        className="flex items-center justify-between gap-2 bg-surface px-3 py-2"
                        title={a.note}
                      >
                        <span className="text-fg-2 truncate">{a.label}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="num">
                            {typeof a.value === "number"
                              ? a.unit === "ratio"
                                ? formatPercent(a.value)
                                : a.unit === "months"
                                  ? `${a.value} m`
                                  : a.unit === "currency"
                                    ? formatMoney(a.value)
                                    : formatNumber(a.value)
                              : String(a.value)}
                          </span>
                          <EvidenceBadge status={a.status} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {discarded.length ? (
          <p className="kicker">
            {discarded.length} {discarded.length === 1 ? "vía descartada" : "vías descartadas"} por no
            aplicable; se listan arriba con sus motivos.
          </p>
        ) : null}
      </section>
    </div>
  );
}
