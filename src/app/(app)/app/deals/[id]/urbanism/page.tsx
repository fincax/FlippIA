import { NoAnalysis } from "@/components/flippia/no-analysis";
import { Badge, EvidenceBadge, FreshnessBadge, SectionTitle, Surface } from "@/components/ds";
import { regulatoryPreamble } from "@/modules/regulatory/engine";
import { loadDeal } from "@/server/deal-page";

export default async function UrbanismPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const u = analysis.urbanism;
  return (
    <div className="space-y-6">
      <Surface className="p-5">
        <SectionTitle kicker="Orquestador de urbanismo" right={<EvidenceBadge status={u.status} />}>
          Planeamiento y protección
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-[13px]">
          <Item label="Instrumento" value={u.planning.planningInstrument} />
          <Item label="Zona de ordenanza" value={`${u.planning.zoningCode} · ${u.planning.zoningLabel}`} />
          <Item
            label="Altura máxima"
            value={u.planning.maxFloors ? `${u.planning.maxFloors} plantas` : "n/d"}
          />
          <Item
            label="Protección"
            value={
              u.planning.protectionLevel +
              (u.planning.heritageSector ? ` · ${u.planning.heritageSector}` : "")
            }
          />
          <Item label="Residencial en planta baja" value={u.planning.groundFloorResidential} />
          <Item label="Conjunto Histórico" value={u.planning.inHistoricCentre ? "Sí" : "No"} />
          <Item
            label="Confianza"
            value={`${Math.round(u.confidence.score * 100)} % — ${u.confidence.factors.map((f) => f.note).join(" ")}`}
          />
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">Frescura</div>
            <FreshnessBadge lastSourceUpdate={u.planning.freshness} lastVerified={undefined} />
            <div className="text-[11px] text-fg-3 mt-1">
              {u.demo ? "Fuente DEMO: verificar en Gerencia de Urbanismo / IDE Sevilla." : "Fuente pública."}
            </div>
          </div>
        </div>
        <p className="mt-4 text-[12px] text-fg-3">{u.planning.notes.join(" ")}</p>
      </Surface>
      <Surface className="p-5">
        <SectionTitle kicker="Comprobación urbanística">Hallazgos</SectionTitle>
        <ul className="space-y-3">
          {u.findings.map((f) => (
            <li key={f.key} className="flex gap-3 items-start">
              <Badge
                tone={f.kind === "constraint" ? "danger" : f.kind === "opportunity" ? "success" : "neutral"}
                className="mt-0.5 shrink-0"
              >
                {f.kind === "constraint" ? "restricción" : f.kind === "opportunity" ? "oportunidad" : "info"}
              </Badge>
              <div className="min-w-0">
                <div className="text-sm text-fg">
                  {f.title} <EvidenceBadge status={f.status} className="ml-1" />
                </div>
                <p className="text-[13px] text-fg-2">{f.detail}</p>
                {f.regulationIds.length ? (
                  <div className="text-[11px] text-fg-3 mt-0.5">Normas: {f.regulationIds.join(", ")}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Surface>
      <Surface className="p-5">
        <SectionTitle kicker="Revisión humana">Comprobaciones requeridas</SectionTitle>
        <ul className="space-y-2">
          {u.requiredChecks.map((c) => (
            <li key={c.key} className="flex gap-3 items-start text-[13px]">
              <span className={c.blocking ? "text-warning" : "text-fg-3"}>
                {c.blocking ? "● bloqueante" : "○"}
              </span>
              <div>
                <div className="text-fg">
                  {c.label} <span className="text-fg-3">· {c.who}</span>
                </div>
                <div className="text-fg-2">{c.why}</div>
              </div>
            </li>
          ))}
        </ul>
      </Surface>
      <Surface className="p-5">
        <SectionTitle kicker="Instantánea normativa" right={<Badge>{analysis.regulatory.fingerprint}</Badge>}>
          Normativa aplicada
        </SectionTitle>
        <p className="text-[13px] text-fg-2 mb-3">{regulatoryPreamble(analysis.regulatory)}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="py-1 font-normal">Norma</th>
                <th className="py-1 font-normal">Ámbito</th>
                <th className="py-1 font-normal">Vigencia</th>
                <th className="py-1 font-normal">Fuente</th>
                <th className="py-1 font-normal">Estado</th>
              </tr>
            </thead>
            <tbody>
              {analysis.regulatory.entries.map((e) => (
                <tr key={e.versionId} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2">
                    <div className="text-fg">{e.shortName}</div>
                    <div className="text-fg-3">{e.title}</div>
                  </td>
                  <td className="py-1.5 pr-2">{e.jurisdiction.label}</td>
                  <td className="py-1.5 pr-2 num">
                    desde {e.effectiveFrom}
                    {e.effectiveUntil ? ` hasta ${e.effectiveUntil}` : ""}
                  </td>
                  <td className="py-1.5 pr-2">
                    {e.sourceUrl ? (
                      <a
                        href={e.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {e.sourceName}
                      </a>
                    ) : (
                      e.sourceName
                    )}
                  </td>
                  <td className="py-1.5">
                    <EvidenceBadge status={e.verificationStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {analysis.regulatory.pending?.length ? (
          <div className="mt-3 text-[12px] text-fg-2">
            <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">
              En tramitación (no aplicado a este análisis)
            </div>
            <ul className="mt-1 list-disc pl-4">
              {analysis.regulatory.pending.map((e) => (
                <li key={e.versionId}>
                  {e.shortName}
                  {e.sourceUrl ? (
                    <>
                      {" "}
                      ·{" "}
                      <a
                        href={e.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {e.sourceName}
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {analysis.regulatory.gaps.length ? (
          <p className="mt-3 text-[12px] text-warning">
            Lagunas: {analysis.regulatory.gaps.map((g) => g.topic).join(", ")}.
          </p>
        ) : null}
      </Surface>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.12em] text-fg-3">{label}</div>
      <div className="text-fg mt-0.5">{value}</div>
    </div>
  );
}
