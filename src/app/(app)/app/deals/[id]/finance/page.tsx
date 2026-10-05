import { NoAnalysis } from "@/components/flippia/no-analysis";
import { Badge, EvidenceBadge, FinancialMetric, SectionTitle, Surface } from "@/components/ds";
import { MaxPricePanel } from "@/components/flippia/max-price-panel";
import { ProfessionalInputsPanel } from "@/components/flippia/professional-inputs-panel";
import { formatMoney, formatPercent } from "@/lib/format";
import { loadDeal, topStrategy } from "@/server/deal-page";
import { getStoredAnalysis } from "@/server/services/deals";
import { professionalInputsView } from "@/server/services/inputs";

export default async function FinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const top = topStrategy(analysis);
  const base = top?.scenarioSet.scenarios.find((s) => s.kind === "base")?.result;
  const inputsView = await professionalInputsView(ctx, id, await getStoredAnalysis(ctx, id));
  return (
    <div className="space-y-6">
      <ProfessionalInputsPanel dealId={id} canEdit={ctx.role !== "viewer"} view={inputsView} />
      <MaxPricePanel
        dealId={id}
        strategies={analysis.strategies.map((s) => ({
          id: s.id,
          label: s.label,
          rank: s.rank,
          asking: s.scenarioSet.base.acquisition.purchasePrice,
        }))}
        investor={{
          targetRoe: analysis.investor.targetRoe,
          targetProfit: analysis.investor.targetProfit,
          maxEquity: analysis.investor.maxEquityPerDeal,
          horizonMonths: analysis.investor.horizonMonths,
        }}
      />
      {base && top ? (
        <Surface className="p-5">
          <SectionTitle
            kicker={`Motor financiero · ${top.label} · base`}
            right={<Badge>{base.taxRuleSetId}</Badge>}
          >
            Desglose completo
          </SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <FinancialMetric label="Coste total (caja)" metric={base.metrics.totalProjectCost} size="sm" />
            <FinancialMetric label="Coste efectivo" metric={base.metrics.effectiveProjectCost} size="sm" />
            <FinancialMetric label="Salida de caja" metric={base.metrics.totalCashOut} size="sm" />
            <FinancialMetric label="Beneficio bruto" metric={base.metrics.grossProfit} size="sm" />
            <FinancialMetric
              label="Beneficio operativo (antes de IRPF/IS)"
              metric={base.metrics.netProfit}
              size="sm"
            />
            <FinancialMetric
              label="Tras IRPF/IS estimado"
              metric={base.metrics.netProfitAfterTax}
              size="sm"
            />
            <FinancialMetric label="IVA recuperable" metric={base.metrics.recoverableTax} size="sm" />
            <FinancialMetric label="LTV" metric={base.metrics.ltv} size="sm" />
            <FinancialMetric label="LTC" metric={base.metrics.ltc} size="sm" />
            <FinancialMetric label="Margen" metric={base.metrics.margin} size="sm" />
            <FinancialMetric label="Precio de equilibrio" metric={base.metrics.breakEvenPrice} size="sm" />
          </div>
          <div className="mb-5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3 mb-2">
              Base, impuestos y coste efectivo
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-fg-3 text-[11px] uppercase tracking-[0.12em]">
                    <th className="py-1 font-normal">Concepto</th>
                    <th className="py-1 font-normal text-right">Base</th>
                    <th className="py-1 font-normal text-right">Impuestos</th>
                    <th className="py-1 font-normal text-right">Total</th>
                    <th className="py-1 font-normal text-right">Recuperable</th>
                    <th className="py-1 font-normal text-right">Coste efectivo</th>
                    <th className="py-1 font-normal">Tratamiento</th>
                  </tr>
                </thead>
                <tbody>
                  {base.tax.concepts.map((c) => (
                    <tr key={c.key} className="border-t border-line">
                      <td className="py-1.5">
                        {c.label}
                        {c.note ? <div className="text-[11px] text-fg-3">{c.note}</div> : null}
                      </td>
                      <td className="py-1.5 text-right num">{formatMoney(c.base)}</td>
                      <td className="py-1.5 text-right num">
                        {c.taxStatus === "UNKNOWN" ? "sin determinar" : formatMoney(c.taxAmount)}
                      </td>
                      <td className="py-1.5 text-right num">
                        {c.taxStatus === "UNKNOWN"
                          ? `${formatMoney(c.base)} + impuestos`
                          : formatMoney(c.gross)}
                      </td>
                      <td className="py-1.5 text-right num">{formatMoney(c.recoverableTax)}</td>
                      <td className="py-1.5 text-right num">{formatMoney(c.effectiveCost)}</td>
                      <td className="py-1.5">
                        <EvidenceBadge status={c.taxStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-fg-3">
              Deducibilidad del IVA soportado: {base.tax.vatRecoverability.note} Coste efectivo{" "}
              {formatMoney(base.tax.effectiveProjectCost)} · caja necesaria{" "}
              {formatMoney(base.tax.cashRequirement)}. Beneficio, ROI y precio de equilibrio se calculan sobre
              el coste efectivo, antes de IRPF/IS del inversor; el capital necesario, sobre la caja.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-fg-3 text-[11px] uppercase tracking-[0.12em]">
                  <th className="py-1 font-normal">Concepto</th>
                  <th className="py-1 font-normal">Origen</th>
                  <th className="py-1 font-normal text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {base.costLines.map((l) => (
                  <tr key={l.key} className="border-t border-line">
                    <td className="py-1.5">
                      {l.label}
                      {l.note ? <span className="text-fg-3"> · {l.note}</span> : null}
                    </td>
                    <td className="py-1.5 text-fg-3">
                      {l.origin === "rule" ? `regla ${l.ruleRef}` : l.origin === "input" ? "dato" : "cálculo"}
                    </td>
                    <td className="py-1.5 text-right num">{formatMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {Object.values(base.metrics).map((m) => (
              <div key={m.key} className="rounded-[var(--radius-sm)] bg-bg-2 p-2.5 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-fg">{m.key}</span>
                  <span className="num text-fg">
                    {m.value === null
                      ? "n/d"
                      : m.unit === "currency"
                        ? formatMoney(m.value)
                        : m.unit === "ratio"
                          ? formatPercent(m.value)
                          : m.value}
                  </span>
                </div>
                <div className="text-fg-3 mt-0.5">
                  <span className="font-mono">{m.formula}</span> — {m.explanation}
                </div>
              </div>
            ))}
          </div>
        </Surface>
      ) : null}
      <Surface className="p-5">
        <SectionTitle
          kicker="Financiación FlippIA"
          right={analysis.finance.demo ? <Badge tone="warning">DEMO</Badge> : null}
        >
          Smart Capital Stack
        </SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {analysis.finance.stacks.map((s) => (
            <div key={s.id} className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="text-sm text-fg">
                {s.label}
                {s.id === analysis.finance.recommendedStackId ? (
                  <span className="text-accent"> · recomendada</span>
                ) : null}
              </div>
              <p className="text-[12px] text-fg-2 mt-1">{s.description}</p>
              <ul className="mt-2 text-[12px] text-fg-3">
                {s.instruments.map((i) => (
                  <li key={i.label}>
                    {i.label}:{" "}
                    {i.sizing.type === "amount"
                      ? formatMoney(i.sizing.amount)
                      : `${Math.round(i.sizing.ratio * 100)} % ${i.sizing.type.toUpperCase()}`}{" "}
                    · {formatPercent(i.annualRate)} ·{" "}
                    {i.interestOnly ? "solo intereses" : `${i.termMonths} meses`}
                    {i.profitShare ? ` · ${Math.round(i.profitShare * 100)} % del beneficio` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4 text-[12px] text-fg-3">
          Ofertas:{" "}
          {analysis.finance.offers
            .map(
              (o) =>
                `${o.providerName} (${o.instrument.label}, hasta ${formatMoney(o.maxAmount)}; ${o.conditions.join(", ")})`,
            )
            .join(" · ")}
        </div>
      </Surface>
    </div>
  );
}
