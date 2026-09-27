import { NoAnalysis } from "@/components/flippia/no-analysis";
import { Badge, EvidenceBadge, FreshnessBadge, SectionTitle, Surface } from "@/components/ds";
import { BuildingVisual } from "@/components/flippia/visual/building-visual";
import { EvidenceDrawer } from "@/components/flippia/visual/evidence-drawer";
import { UrbanCheck, UrbanLayerVisual, type UrbanLayer } from "@/components/flippia/visual/urban-layers";
import { regulatoryPreamble } from "@/modules/regulatory/engine";
import { loadDeal } from "@/server/deal-page";

/**
 * SCREEN 05a — Urban Intelligence. The parcel through its regulatory strata.
 * Every layer is a field the urbanism module already returned; the status is
 * the evidence status it assigned. Nothing is queried from here.
 */
export default async function UrbanismPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const u = analysis.urbanism;
  const p = u.planning;
  // Each layer reads its status from the finding the urbanism agents emitted for it.
  const finding = (key: string) => u.findings.find((f) => f.key === key);
  const zoning = finding("zoning");
  const uses = finding("uses");
  const protection = finding("protection");
  const useChange = finding("change_of_use");
  const habitability = u.requiredChecks.find((c) => c.key === "habitability");
  const useChangeRun = analysis.agentRuns.find((r) => r.agentType === "urbanism.change_of_use");
  const layers: UrbanLayer[] = [
    {
      key: "use",
      label: "Uso",
      value: p.allowedUses.length ? p.allowedUses.join(", ") : "n/d",
      status: uses?.status ?? p.status,
      note: p.conditionedUses.length ? `Condicionados: ${p.conditionedUses.join(", ")}` : undefined,
    },
    {
      key: "planning",
      label: "Planeamiento",
      value: `${p.planningInstrument} · ${p.zoningCode} · ${p.zoningLabel}`,
      status: zoning?.status ?? p.status,
    },
    {
      key: "protection",
      label: "Protección",
      value:
        p.protectionLevel +
        (p.heritageSector ? ` · ${p.heritageSector}` : "") +
        (p.catalogued ? " · catalogado" : ""),
      status: protection?.status ?? p.status,
      note: protection?.title,
    },
    {
      key: "height",
      label: "Altura",
      value: p.maxFloors ? `${p.maxFloors} plantas máx.` : "n/d",
      status: p.maxFloors ? (zoning?.status ?? p.status) : "UNKNOWN",
    },
    {
      key: "ground",
      label: "Planta baja",
      value:
        p.groundFloorResidential === "allowed"
          ? "Residencial permitido"
          : p.groundFloorResidential === "conditioned"
            ? "Residencial condicionado"
            : p.groundFloorResidential === "forbidden"
              ? "Residencial prohibido"
              : "n/d",
      status: p.groundFloorResidential === "unknown" ? "UNKNOWN" : (zoning?.status ?? p.status),
    },
    {
      key: "usechange",
      label: "Cambio de uso",
      value: useChange
        ? useChange.title
        : useChangeRun?.status === "skipped"
          ? "No evaluado: no necesario para este activo"
          : "Sin hallazgo específico",
      status: useChange ? (useChange.kind === "opportunity" ? "POSSIBLE" : useChange.status) : "UNKNOWN",
      note: useChange?.detail,
    },
    ...(habitability
      ? [
          {
            key: "habitability",
            label: "Habitabilidad",
            value: habitability.label,
            status: "REVIEW_REQUIRED" as const,
            note: habitability.why,
          },
        ]
      : []),
  ];
  const byId = new Map(analysis.evidence.map((e) => [e.id, e]));
  const evidenceFor = (ids: string[] | undefined) =>
    (ids ?? []).map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  const findingIds = new Set(u.findings.flatMap((f) => f.evidenceIds ?? []));
  // Analyses persisted before findings carried evidence ids fall back to the planning sources.
  const planningEvidence = findingIds.size
    ? analysis.evidence.filter((e) => findingIds.has(e.id))
    : analysis.evidence.filter(
        (e) => e.sourceType === "official_planning" || e.sourceType === "official_gazette",
      );
  const blocking = u.requiredChecks.filter((c) => c.blocking).length;
  return (
    <div className="space-y-10">
      {/* ── Urban digital layer ─────────────────────────────────────── */}
      <section className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="frame border border-line bg-surface p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="kicker">Urban digital layer</div>
              <h2 className="font-display text-xl md:text-2xl mt-1">La parcela por capas</h2>
            </div>
            <EvidenceBadge status={u.status} />
          </div>
          <div className="mt-6">
            <UrbanLayerVisual layers={layers} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <div className="kicker">Confianza</div>
              <div className="num text-fg mt-0.5">{Math.round(u.confidence.score * 100)} %</div>
              <div className="text-fg-3">{u.confidence.factors.map((f) => f.note).join(" ")}</div>
            </div>
            <div>
              <div className="kicker">Frescura</div>
              <FreshnessBadge lastSourceUpdate={p.freshness} className="mt-0.5" />
              <div className="text-fg-3 mt-0.5">
                {u.demo
                  ? "Fuente DEMO: verificar en Gerencia de Urbanismo / IDE Sevilla."
                  : "Fuente pública."}
              </div>
            </div>
          </div>
        </div>

        <div className="frame border border-line bg-surface p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="kicker">Urban check</div>
              <h2 className="font-display text-xl md:text-2xl mt-1">
                {blocking
                  ? `Necesito comprobar ${blocking} ${blocking === 1 ? "cosa" : "cosas"} antes de darlo por viable.`
                  : "Sin comprobaciones bloqueantes."}
              </h2>
            </div>
            <EvidenceDrawer title="Planeamiento y protección" items={planningEvidence} />
          </div>
          <UrbanCheck layers={layers} className="mt-5" />
          <p className="mt-4 text-[12px] text-fg-3">
            {p.notes.join(" ")}{" "}
            <span className="text-fg-3">* POSSIBLE: posible, condicionado a comprobación.</span>
          </p>
        </div>
      </section>

      {/* ── Envelope + findings ─────────────────────────────────────── */}
      <section className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <Surface className="p-5 relative">
          <SectionTitle kicker="Envolvente">Lo que el planeamiento permite</SectionTitle>
          <BuildingVisual
            stage="current"
            floors={Math.max(1, Math.min(p.maxFloors ?? 3, 3))}
            maxFloors={p.maxFloors}
            units={analysis.architecture.current.units}
            className="pb-6"
          />
        </Surface>
        <Surface className="p-5">
          <SectionTitle kicker="Comprobación urbanística">Hallazgos</SectionTitle>
          <ul className="space-y-3">
            {u.findings.map((f, i) => (
              <li
                key={f.key}
                className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 items-start border-t border-line pt-3 first:border-0 first:pt-0"
              >
                <span className="kicker num pt-1">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        f.kind === "constraint" ? "danger" : f.kind === "opportunity" ? "success" : "neutral"
                      }
                    >
                      {f.kind === "constraint"
                        ? "restricción"
                        : f.kind === "opportunity"
                          ? "oportunidad"
                          : "info"}
                    </Badge>
                    <span className="text-sm text-fg">{f.title}</span>
                    <EvidenceBadge status={f.status} />
                  </div>
                  <p className="text-[13px] text-fg-2 mt-1">{f.detail}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {f.regulationIds.length ? (
                      <span className="kicker normal-case tracking-normal">
                        Normas: {f.regulationIds.join(", ")}
                      </span>
                    ) : null}
                    <EvidenceDrawer title={f.title} items={evidenceFor(f.evidenceIds)} label="Evidencia" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      </section>

      {/* ── Required checks ─────────────────────────────────────────── */}
      <Surface className="p-5">
        <SectionTitle kicker="Revisión humana">
          {u.requiredChecks.length
            ? `LIA necesita ${u.requiredChecks.length} ${u.requiredChecks.length === 1 ? "comprobación" : "comprobaciones"}`
            : "Sin comprobaciones pendientes"}
        </SectionTitle>
        <ol className="grid gap-px sm:grid-cols-2 bg-line border border-line">
          {u.requiredChecks.map((c, i) => (
            <li key={c.key} className="bg-surface p-4 grid grid-cols-[32px_minmax(0,1fr)] gap-3">
              <span className={c.blocking ? "kicker num text-warning" : "kicker num"}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="text-[13px]">
                <div className="text-fg flex flex-wrap items-center gap-2">
                  {c.label}
                  <span className="kicker">{c.who}</span>
                  {c.blocking ? <span className="kicker text-warning">bloqueante</span> : null}
                </div>
                <div className="text-fg-2 mt-0.5">{c.why}</div>
              </div>
            </li>
          ))}
        </ol>
      </Surface>

      {/* ── Regulatory snapshot ─────────────────────────────────────── */}
      <Surface className="p-5">
        <SectionTitle kicker="Instantánea normativa" right={<Badge>{analysis.regulatory.fingerprint}</Badge>}>
          Normativa aplicada
        </SectionTitle>
        <p className="text-[13px] text-fg-2 mb-3">{regulatoryPreamble(analysis.regulatory)}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left kicker">
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
        {analysis.regulatory.gaps.length ? (
          <p className="mt-3 text-[12px] text-warning">
            Lagunas: {analysis.regulatory.gaps.map((g) => g.topic).join(", ")}.
          </p>
        ) : null}
      </Surface>
    </div>
  );
}
