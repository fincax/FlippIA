import { labelRisk, labelSeverity } from "@/lib/labels";
import { NoAnalysis } from "@/components/flippia/no-analysis";
import { Badge, Money, Pct, SectionTitle, Surface, Tornado } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import { loadDeal } from "@/server/deal-page";

const SEV: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
};

export default async function RiskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const strategies = analysis.strategies.filter((s) => s.stress);
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle
          kicker="¿Qué puede salir mal?"
          right={
            <Badge
              tone={
                analysis.risk.overall === "high"
                  ? "danger"
                  : analysis.risk.overall === "medium"
                    ? "warning"
                    : "success"
              }
            >
              riesgo {labelRisk(analysis.risk.overall)}
            </Badge>
          }
        >
          Rompe esta inversión
        </SectionTitle>
        <p className="text-sm text-fg-2 max-w-3xl">
          {analysis.risk.summary} Seis agentes adversariales intentan demostrar que la operación es mala; el
          Stress Engine mide cuánto aguanta cada estrategia.
        </p>
      </div>
      {strategies.map((s) => {
        const st = s.stress!;
        return (
          <Surface key={s.id} className="p-5">
            <SectionTitle
              kicker={`${String(s.rank).padStart(2, "0")} · ${s.label}`}
              right={
                <Badge
                  tone={st.survivalRate >= 0.7 ? "success" : st.survivalRate >= 0.4 ? "warning" : "danger"}
                >
                  sobrevive {Math.round(st.survivalRate * 100)} %
                </Badge>
              }
            >
              Stress test
            </SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-5 text-[13px]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">Break-even</div>
                <div className="font-display text-lg">
                  <Money value={st.breakEvenPrice} />
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">Margen de seguridad</div>
                <div className="font-display text-lg">
                  <Pct value={st.marginOfSafety} />
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">Reforma máxima</div>
                <div className="font-display text-lg">
                  <Money value={st.maximumRenovation} />
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">
                  Precio mínimo de salida
                </div>
                <div className="font-display text-lg">
                  <Money value={st.minimumExitPrice} />
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">Compra máxima</div>
                <div className="font-display text-lg">
                  <Money value={st.maximumAcquisition} />
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">Capital en riesgo</div>
                <div className="font-display text-lg text-danger">
                  <Money value={st.capitalAtRisk} />
                </div>
              </div>
            </div>
            <Tornado
              items={st.outcomes.map((o) => ({ label: o.label, delta: o.deltaProfit, survives: o.survives }))}
              format={(v) => formatMoney(v, { signed: true })}
            />
            <div className="mt-3 text-[12px] text-fg-3">
              Beneficio base <Money value={st.base.netProfit} />. Barras: variación del beneficio neto por
              escenario; rojo = deja de ser rentable.
            </div>
          </Surface>
        );
      })}
      <Surface className="p-5">
        <SectionTitle kicker="Agentes adversariales">Hallazgos</SectionTitle>
        <ul className="space-y-2">
          {analysis.risk.findings.map((f, i) => (
            <li
              key={i}
              className="flex gap-3 items-start border-t border-line pt-2 first:border-0 first:pt-0"
            >
              <Badge tone={SEV[f.severity] ?? "neutral"} className="mt-0.5 shrink-0">
                {labelSeverity(f.severity)}
              </Badge>
              <div className="min-w-0">
                <div className="text-sm text-fg">
                  {f.title} <span className="text-fg-3">· {f.agent}</span>
                </div>
                <p className="text-[13px] text-fg-2">{f.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}
