import { Badge, EvidenceBadge, SectionTitle, Surface } from "@/components/ds";
import { MicrozoneMap } from "@/components/flippia/microzone-map";
import { formatDate, formatMoney } from "@/lib/format";
import { loadDeal } from "@/server/deal-page";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { analysis } = await loadDeal(id);
  if (!analysis) return null;
  const m = analysis.market;
  const v = m.valuationRenovated;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Surface className="p-5">
          <SectionTitle
            kicker="Market Orchestrator"
            right={
              <span className="flex gap-1">
                <EvidenceBadge status={m.status} />
                {m.demo ? <Badge tone="warning">DEMO</Badge> : null}
              </span>
            }
          >
            Valoración
          </SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">As-is</div>
              <div className="font-display text-xl num">
                {formatMoney(m.valuationUnrenovated.value.point)}
              </div>
              <div className="text-fg-3">{m.valuationUnrenovated.pricePerM2.point} €/m²</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">ARV central</div>
              <div className="font-display text-xl num text-accent">{formatMoney(v.value.point)}</div>
              <div className="text-fg-3">{v.pricePerM2.point} €/m²</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">Rango ARV</div>
              <div className="num">
                {formatMoney(v.value.low)} – {formatMoney(v.value.high)}
              </div>
              <div className="text-fg-3">cuartiles 25–75</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">Renta</div>
              <div className="font-display text-xl num">{formatMoney(m.rent.monthly.point)}/mes</div>
              <div className="text-fg-3">{m.rent.perM2Month} €/m²/mes</div>
            </div>
          </div>
          <p className="mt-4 text-[13px] text-fg-2">{v.methodology}</p>
          <div className="mt-3 text-[12px] text-fg-3">
            Confianza {Math.round(v.confidence.score * 100)} %:{" "}
            {v.confidence.factors
              .map((f) => `${f.key} ${Math.round(f.score * 100)} % (${f.note})`)
              .join(" · ")}
          </div>
          <div className="mt-2 text-[12px] text-fg-2">
            {m.askingVsValue.note} Liquidez {m.liquidity.level}, demanda {m.liquidity.demand},{" "}
            {m.liquidity.daysToSell} días de venta. {m.snapshot.stats.confidenceNote}
          </div>
        </Surface>
        <Surface className="p-5">
          <SectionTitle kicker="Mapa">Oportunidades, no solo inmuebles</SectionTitle>
          <MicrozoneMap
            activeId={m.microzoneId}
            point={analysis.property.property.coordinates}
            comparables={v.comparablesUsed.map((c) => ({
              id: c.id,
              distanceM: c.distanceM,
              ppm2: c.adjustedPricePerM2,
            }))}
          />
        </Surface>
      </div>
      <Surface className="p-5">
        <SectionTitle kicker="Comparables">Usados y descartados</SectionTitle>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="px-2 py-1 font-normal">Tipo</th>
                <th className="px-2 py-1 font-normal">Fecha</th>
                <th className="px-2 py-1 font-normal text-right">Distancia</th>
                <th className="px-2 py-1 font-normal text-right">€/m² bruto</th>
                <th className="px-2 py-1 font-normal text-right">€/m² ajustado</th>
                <th className="px-2 py-1 font-normal text-right">Peso</th>
                <th className="px-2 py-1 font-normal">Ajustes</th>
              </tr>
            </thead>
            <tbody>
              {v.comparablesUsed.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-2 py-1.5">
                    {c.type}
                    {c.demo ? (
                      <Badge tone="warning" className="ml-1">
                        DEMO
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 num">{formatDate(c.date)}</td>
                  <td className="px-2 py-1.5 num text-right">{c.distanceM} m</td>
                  <td className="px-2 py-1.5 num text-right">{c.rawPricePerM2}</td>
                  <td className="px-2 py-1.5 num text-right">{c.adjustedPricePerM2}</td>
                  <td className="px-2 py-1.5 num text-right">{c.weight}</td>
                  <td className="px-2 py-1.5 text-fg-3">
                    {c.adjustments.map((a) => `${a.key} ×${a.factor.toFixed(2)}`).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {v.comparablesRejected.length ? (
          <p className="mt-3 text-[12px] text-fg-3">
            Descartados: {v.comparablesRejected.map((r) => `${r.id} (${r.reason})`).join("; ")}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] text-fg-3">
          No se confunde precio anunciado (asking) con precio transaccionado: los primeros se ajustan y pesan
          menos.
        </p>
      </Surface>
    </div>
  );
}
