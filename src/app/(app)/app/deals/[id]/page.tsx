import { NoAnalysis } from "@/components/flippia/no-analysis";
import Link from "next/link";
import {
  Badge,
  EvidenceBadge,
  FinancialMetric,
  Kicker,
  Money,
  RadialDNA,
  SectionTitle,
  Surface,
} from "@/components/ds";
import { MagicPanel } from "@/components/flippia/magic-panel";
import { StrategyCard } from "@/components/flippia/strategy-card";
import { WatchButton } from "@/components/flippia/watch-button";
import { formatMoney } from "@/lib/format";
import { labelRisk } from "@/lib/labels";
import { loadDeal, topStrategy } from "@/server/deal-page";

export default async function DealOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const top = topStrategy(analysis);
  const base = top?.scenarioSet.scenarios.find((s) => s.kind === "base")?.result;
  const futures = analysis.strategies.filter((s) => s.applicability.applicable);
  return (
    <div className="space-y-10">
      <section>
        <Kicker>Tesis de inversión</Kicker>
        <h2 className="font-display text-3xl md:text-4xl mt-1 text-fg">{analysis.synthesis.headline}</h2>
        <p className="mt-3 text-fg-2 max-w-3xl leading-relaxed">{analysis.synthesis.thesis}</p>
        <div className="mt-3 text-[11px] text-fg-3">
          Narrativa:{" "}
          {analysis.synthesis.narrativeSource === "model"
            ? "modelo (sobre hechos calculados)"
            : "plantilla determinista"}{" "}
          · cifras: motores deterministas · {analysis.evidence.length} evidencias · normativa a{" "}
          {analysis.regulatory.analysisDate}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {futures.slice(0, 4).map((s, i) => (
          <StrategyCard key={s.id} dealId={id} strategy={s} index={i} compact />
        ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-8">
          {top && base ? (
            <Surface className="p-5">
              <SectionTitle
                kicker={`01 · ${top.label}`}
                right={
                  <Link
                    href={`/app/deals/${id}/strategies#${top.id}`}
                    className="text-sm text-fg-2 hover:text-fg"
                  >
                    Profundizar →
                  </Link>
                }
              >
                Escenario base
              </SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FinancialMetric label="Beneficio neto" metric={base.metrics.netProfit} />
                <FinancialMetric
                  label="ROE"
                  metric={base.metrics.roe}
                  hint={`anualizado ${base.metrics.annualizedRoe.value !== null ? Math.round(base.metrics.annualizedRoe.value * 1000) / 10 + " %" : "n/d"}`}
                />
                <FinancialMetric label="Capital necesario" metric={base.metrics.equityRequired} />
                <FinancialMetric label="Duración" metric={base.metrics.durationMonths} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[12px] text-fg-2">
                {top.whyRanked.map((w) => (
                  <span key={w} className="rounded-full border border-line px-2.5 py-1">
                    {w}
                  </span>
                ))}
              </div>
            </Surface>
          ) : null}

          <Surface className="p-5">
            <SectionTitle kicker="Diferencial de oportunidad">
              Lo que es hoy y lo que puede llegar a ser
            </SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-end">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Valor actual</div>
                <div className="font-display text-2xl num">{formatMoney(analysis.gap.currentValue)}</div>
              </div>
              <div className="sm:text-center">
                <div className="text-[11px] uppercase tracking-[0.14em] text-accent">Diferencial</div>
                <div className="font-display text-3xl num text-accent">
                  <Money value={analysis.gap.gap} signed />
                </div>
              </div>
              <div className="sm:text-right">
                <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Valor potencial</div>
                <div className="font-display text-2xl num">{formatMoney(analysis.gap.potentialValue)}</div>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-surface-raised overflow-hidden">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${Math.min(100, Math.max(4, (analysis.gap.currentValue / Math.max(1, analysis.gap.potentialValue)) * 100))}%`,
                }}
              />
            </div>
            <ul className="mt-4 space-y-1.5 text-[13px]">
              {analysis.gap.levers.map((l) => (
                <li key={l.key} className="flex justify-between gap-3">
                  <span className="text-fg-2">
                    {l.label} — {l.explanation}
                  </span>
                  <Money value={l.amount} signed className="shrink-0" />
                </li>
              ))}
            </ul>
          </Surface>

          <MagicPanel dealId={id} />
        </section>

        <aside className="space-y-8">
          <Surface className="p-5">
            <SectionTitle
              kicker="ADN de la oportunidad"
              right={<Badge tone="accent">{analysis.dna.composite.score}/100</Badge>}
            >
              Nueve dimensiones
            </SectionTitle>
            <RadialDNA dimensions={analysis.dna.dimensions} />
            <ul className="mt-3 space-y-1 text-[12px]">
              {analysis.dna.dimensions.map((d) => (
                <li key={d.key} className="flex justify-between gap-2">
                  <span className="text-fg-2">{d.label}</span>
                  <span className="num">{d.score}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-fg-3">
              Compuesto = {analysis.dna.composite.formula}. Pesos:{" "}
              {Object.entries(analysis.dna.composite.weights)
                .map(
                  ([k, v]) =>
                    `${analysis.dna.dimensions.find((d) => d.key === k)?.label ?? k} ${Math.round(v * 100)} %`,
                )
                .join(", ")}
              . {analysis.dna.composite.uncertainty} El score es orientativo; las dimensiones importan más.
            </p>
          </Surface>

          <Surface className="p-5">
            <SectionTitle kicker="Estado">Evidencia</SectionTitle>
            <ul className="space-y-2 text-[13px]">
              <li className="flex justify-between">
                <span className="text-fg-2">Mercado</span>
                <EvidenceBadge status={analysis.market.status} />
              </li>
              <li className="flex justify-between">
                <span className="text-fg-2">Urbanismo</span>
                <EvidenceBadge status={analysis.urbanism.status} />
              </li>
              <li className="flex justify-between">
                <span className="text-fg-2">Arquitectura</span>
                <EvidenceBadge status={analysis.architecture.status} />
              </li>
              <li className="flex justify-between">
                <span className="text-fg-2">Riesgo global</span>
                <Badge
                  tone={
                    analysis.risk.overall === "high"
                      ? "danger"
                      : analysis.risk.overall === "medium"
                        ? "warning"
                        : "success"
                  }
                >
                  {labelRisk(analysis.risk.overall)}
                </Badge>
              </li>
            </ul>
            {analysis.synthesis.missingData.length ? (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3 mb-1">Datos que faltan</div>
                <ul className="text-[13px] text-fg-2 list-disc pl-4 space-y-0.5">
                  {analysis.synthesis.missingData.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <WatchButton dealId={id} label={deal.title} price={analysis.property.askingPrice} />
              <Link
                href={`/app/deals/${id}/risk`}
                className="rounded-[var(--radius-md)] border border-line px-3 py-2 text-sm text-fg-2 hover:text-fg"
              >
                ¿Qué puede salir mal?
              </Link>
              <Link
                href={`/app/deals/${id}/finance`}
                className="rounded-[var(--radius-md)] border border-line px-3 py-2 text-sm text-fg-2 hover:text-fg"
              >
                ¿Hasta cuánto puedo pagar?
              </Link>
            </div>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
