import { NoAnalysis } from "@/components/flippia/no-analysis";
import Link from "next/link";
import { Badge, EvidenceBadge, FinancialMetric, RadialDNA, SectionTitle, Surface } from "@/components/ds";
import { MagicPanel } from "@/components/flippia/magic-panel";
import { EvidenceDrawer } from "@/components/flippia/visual/evidence-drawer";
import { ExplodedInvestmentView, type InvestmentLayer } from "@/components/flippia/visual/exploded-view";
import { FutureTree } from "@/components/flippia/visual/future-tree";
import { LIAPulse } from "@/components/flippia/visual/lia-pulse";
import { OpportunityGapVisual } from "@/components/flippia/visual/opportunity-gap";
import { WatchButton } from "@/components/flippia/watch-button";
import { formatMoney } from "@/lib/format";
import { labelRisk } from "@/lib/labels";
import { loadDeal, topStrategy } from "@/server/deal-page";

/** SCREEN 03 — Possible Futures. The asset today, and what it can become. */
export default async function DealOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const top = topStrategy(analysis);
  const base = top?.scenarioSet.scenarios.find((s) => s.kind === "base")?.result;
  const futures = analysis.strategies.filter((s) => s.applicability.applicable);
  const n = futures.length;
  const prop = analysis.property;
  const stackLabel =
    analysis.finance.stacks.find((s) => s.id === analysis.finance.recommendedStackId)?.label ??
    analysis.finance.stacks[0]?.label ??
    "Sin estructura";
  const layers: InvestmentLayer[] = [
    {
      key: "value",
      label: "Valor",
      headline: `${formatMoney(analysis.market.valuationUnrenovated.value.point)} as-is → ${formatMoney(analysis.market.valuationRenovated.value.point)} reformado`,
      detail: analysis.market.askingVsValue.note,
      href: `/app/deals/${id}/market`,
      status: analysis.market.status,
    },
    {
      key: "finance",
      label: "Financiación",
      headline: stackLabel,
      detail: analysis.finance.summary,
      href: `/app/deals/${id}/finance`,
    },
    {
      key: "reform",
      label: "Reforma",
      headline: top?.transformation.estimate
        ? `${formatMoney(top.transformation.estimate.contractBudget)} · ${top.transformation.level}`
        : "Sin obra en la vía principal",
      detail: top ? `Vía ${String(top.rank).padStart(2, "0")} · ${top.label}` : undefined,
      href: `/app/deals/${id}/scenarios`,
    },
    {
      key: "architecture",
      label: "Arquitectura",
      headline: `${analysis.architecture.alternatives.length} alternativas · ${analysis.architecture.current.areaM2} m² · ${analysis.architecture.current.bedrooms} dorm.`,
      detail: analysis.architecture.summary,
      href: `/app/deals/${id}/architecture`,
      status: analysis.architecture.status,
    },
    {
      key: "urbanism",
      label: "Urbanismo",
      headline: `${analysis.urbanism.planning.zoningCode} · ${analysis.urbanism.planning.zoningLabel}`,
      detail: `${analysis.urbanism.requiredChecks.length} comprobaciones · ${analysis.urbanism.summary}`,
      href: `/app/deals/${id}/urbanism`,
      status: analysis.urbanism.status,
    },
    {
      key: "property",
      label: "Activo",
      headline: `${prop.property.builtAreaM2} m² · ${prop.microzone.name}${prop.cadastral.yearBuilt ? ` · ${prop.cadastral.yearBuilt}` : ""}`,
      detail: prop.cadastral.cadastralRef
        ? `RC ${prop.cadastral.cadastralRef}`
        : "Referencia catastral sin confirmar",
      href: `/app/deals/${id}/evidence`,
      status: prop.cadastral.found ? "VERIFIED" : "REVIEW_REQUIRED",
    },
  ];
  return (
    <div className="space-y-12">
      {/* ── HE ENCONTRADO N FUTUROS POSIBLES ─────────────────────────── */}
      <section className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-end">
        <div>
          <div className="flex items-center gap-3">
            <LIAPulse state="revealing" size={8} />
            <span className="kicker text-accent">LIA</span>
          </div>
          {n ? (
            <div className="mt-5" aria-hidden>
              <div className="font-display uppercase tracking-[0.08em] text-fg-2 text-sm md:text-base">
                He encontrado
              </div>
              <div className="display-xl num text-[26vw] sm:text-[9rem] md:text-[11rem] text-fg -ml-1 leading-[0.85]">
                {String(n).padStart(2, "0")}
              </div>
              <div className="font-display uppercase tracking-[0.08em] text-fg-2 text-sm md:text-base mt-1">
                {n === 1 ? "Futuro posible" : "Futuros posibles"}
              </div>
            </div>
          ) : null}
          <h2 className={n ? "text-fg-2 text-sm mt-3" : "font-display text-2xl md:text-3xl mt-5 text-fg"}>
            {analysis.synthesis.headline}
          </h2>
        </div>
        <div className="lg:pb-2">
          <p className="text-fg-2 leading-relaxed max-w-2xl text-[15px]">{analysis.synthesis.thesis}</p>
          {analysis.synthesis.warnings.length ? (
            <ul className="mt-4 space-y-1">
              {analysis.synthesis.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2 text-[13px] text-warning">
                  <span aria-hidden className="mt-1.5 size-1.5 bg-warning shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <EvidenceDrawer title="Tesis de inversión" items={analysis.evidence} />
            <span className="kicker">
              narrativa{" "}
              {analysis.synthesis.narrativeSource === "model"
                ? "modelo sobre hechos calculados"
                : "plantilla determinista"}{" "}
              · cifras: motores deterministas · normativa a {analysis.regulatory.analysisDate}
            </span>
          </div>
        </div>
      </section>

      {/* ── Possibility tree ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <div className="kicker">Árbol de posibilidades</div>
            <h2 className="font-display text-xl md:text-2xl mt-1">Lo que este activo puede llegar a ser</h2>
          </div>
          <Link href={`/app/deals/${id}/strategies`} className="kicker hover:text-fg">
            Comparar futuros →
          </Link>
        </div>
        <FutureTree
          origin={{
            label: prop.property.address.street ?? deal.title,
            sublabel: `${prop.microzone.name} · ${prop.property.builtAreaM2} m²`,
            value: analysis.gap.currentValue,
          }}
          futures={futures}
          hrefFor={(s) => `/app/deals/${id}/strategies#${s.id}`}
        />
      </section>

      {/* ── Gap + exploded view ──────────────────────────────────────── */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="frame border border-line bg-surface p-5 md:p-6">
          <SectionTitle kicker="Diferencial de oportunidad">De dónde sale el valor</SectionTitle>
          <OpportunityGapVisual
            currentValue={analysis.gap.currentValue}
            potentialValue={analysis.gap.potentialValue}
            gap={analysis.gap.gap}
            levers={analysis.gap.levers}
          />
        </section>
        <section className="frame border border-line bg-surface p-5 md:p-6">
          <SectionTitle kicker="Vista explosionada">Capas del activo</SectionTitle>
          <ExplodedInvestmentView layers={layers} />
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-8">
          {top && base ? (
            <Surface className="p-5 md:p-6">
              <SectionTitle
                kicker={`${String(top.rank).padStart(2, "0")} · ${top.label}`}
                right={
                  <Link href={`/app/deals/${id}/strategies#${top.id}`} className="kicker hover:text-fg">
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
              <ul className="mt-5 space-y-1.5 border-t border-line pt-4">
                {top.whyRanked.map((w, i) => (
                  <li
                    key={`${i}-${w}`}
                    className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 text-[13px] text-fg-2"
                  >
                    <span className="kicker num">{String(i + 1).padStart(2, "0")}</span>
                    {w}
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}

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
                <li key={d.key} className="grid grid-cols-[minmax(0,1fr)_80px_32px] items-center gap-2">
                  <span className="text-fg-2 truncate">{d.label}</span>
                  <span className="h-1 bg-bg-2 overflow-hidden" aria-hidden>
                    <span className="block h-full bg-fg-3" style={{ width: `${d.score}%` }} />
                  </span>
                  <span className="num text-right">{d.score}</span>
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
                <div className="kicker mb-1">Datos que faltan</div>
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
