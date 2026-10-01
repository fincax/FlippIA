import { formatNumber } from "@/lib/format";
import { labelConstraint } from "@/lib/labels";
import { NoAnalysis } from "@/components/flippia/no-analysis";
import { Badge, EvidenceBadge, FinancialMetric, Money, Pct, Surface } from "@/components/ds";
import { loadDeal } from "@/server/deal-page";

export default async function StrategiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-2 max-w-3xl">
        Cada activo se estudia con todas las estrategias compatibles (MultiExit). Ninguna se presenta como
        viable sin validación: las condicionadas muestran sus comprobaciones. El orden explica sus motivos.
      </p>
      {analysis.strategies.map((s) => {
        const base = s.scenarioSet.scenarios.find((x) => x.kind === "base")?.result;
        return (
          <Surface key={s.id} id={s.id} className="p-5 scroll-mt-24">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] num text-accent">
                  {String(s.rank).padStart(2, "0")} · score {s.score}
                </div>
                <h2 className="font-display text-2xl">{s.label}</h2>
                <p className="text-sm text-fg-2 mt-1 max-w-2xl">{s.description}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge>{s.family}</Badge>
                <Badge>{s.exitKind === "sale" ? "venta" : "alquiler"}</Badge>
                <Badge>obra: {s.transformation.level}</Badge>
                {s.applicability.conditional ? (
                  <Badge tone="warning">condicionada</Badge>
                ) : (
                  <Badge tone="success">sin bloqueos</Badge>
                )}
              </div>
            </div>
            {base ? (
              <div className="mt-5 grid grid-cols-2 md:grid-cols-6 gap-4">
                <FinancialMetric label="Beneficio neto" metric={base.metrics.netProfit} size="sm" />
                <FinancialMetric label="ROE" metric={base.metrics.roe} size="sm" />
                <FinancialMetric label="TIR" metric={base.metrics.irr} size="sm" />
                <FinancialMetric label="Capital" metric={base.metrics.equityRequired} size="sm" />
                <FinancialMetric label="Coste total" metric={base.metrics.totalProjectCost} size="sm" />
                <FinancialMetric label="Duración" metric={base.metrics.durationMonths} size="sm" />
              </div>
            ) : null}
            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3 mb-2">
                  Por qué en esta posición
                </div>
                <ul className="text-[13px] text-fg-2 space-y-1 list-disc pl-4">
                  {s.whyRanked.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3 mt-4 mb-2">
                  Motivos de aplicabilidad
                </div>
                <ul className="text-[13px] text-fg-2 space-y-1 list-disc pl-4">
                  {s.applicability.reasons.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3 mb-2">
                  Comprobaciones requeridas
                </div>
                {s.applicability.requiredChecks.length ? (
                  <ul className="space-y-1.5">
                    {s.applicability.requiredChecks.map((c) => (
                      <li key={c.key} className="text-[13px]">
                        <span className={c.blocking ? "text-warning" : "text-fg"}>
                          {c.blocking ? "● " : "○ "}
                          {c.label}
                        </span>
                        <span className="text-fg-3">
                          {" "}
                          — {c.who}. {c.why}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-fg-3">Ninguna comprobación bloqueante.</p>
                )}
                {s.stress ? (
                  <div className="mt-4 text-[13px] text-fg-2">
                    Estrés: sobrevive a <Pct value={s.stress.survivalRate} decimals={0} /> de los escenarios ·
                    margen de seguridad <Pct value={s.stress.marginOfSafety} /> · capital en riesgo{" "}
                    <Money value={s.stress.capitalAtRisk} />
                  </div>
                ) : null}
                {s.maxPrice ? (
                  <div className="mt-1 text-[13px] text-fg-2">
                    Precio máximo para tus objetivos: <Money value={s.maxPrice.maximumPrice} /> (
                    {labelConstraint(s.maxPrice.bindingConstraint)})
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3 mb-2">Hipótesis</div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 text-[12px]">
                {s.scenarioSet.assumptions.map((a) => (
                  <div
                    key={a.path}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-bg-2 px-2.5 py-1.5"
                    title={a.note}
                  >
                    <span className="text-fg-2 truncate">{a.label}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="num">
                        {typeof a.value === "number"
                          ? a.unit === "ratio"
                            ? `${Math.round(a.value * 1000) / 10} %`
                            : a.unit === "months"
                              ? `${a.value} m`
                              : formatNumber(a.value) + (a.unit === "currency" ? " €" : "")
                          : String(a.value)}
                      </span>
                      {a.source === "user" ? (
                        <Badge
                          tone="neutral"
                          title="Dato declarado por el usuario; no contrastado con una fuente."
                        >
                          Usuario
                        </Badge>
                      ) : a.source === "demo" ? (
                        <Badge tone="warning">DEMO</Badge>
                      ) : (
                        <EvidenceBadge status={a.status} />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Surface>
        );
      })}
    </div>
  );
}
