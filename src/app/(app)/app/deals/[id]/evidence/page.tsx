import { NoAnalysis } from "@/components/flippia/no-analysis";
import { Badge, EvidenceBadge, SectionTitle, Surface } from "@/components/ds";
import { formatDate } from "@/lib/format";
import { loadDeal } from "@/server/deal-page";

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const groups = new Map<string, typeof analysis.evidence>();
  for (const e of analysis.evidence) groups.set(e.sourceName, [...(groups.get(e.sourceName) ?? []), e]);
  return (
    <div className="space-y-6">
      <Surface className="p-5">
        <SectionTitle kicker="Estado de las fuentes">Fuentes consultadas</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[13px]">
          {analysis.sources.map((s) => (
            <div key={s.sourceId} className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-fg truncate">{s.name}</span>
                <Badge tone={s.available ? (s.demo ? "warning" : "success") : "danger"}>
                  {s.available ? s.mode : "no disponible"}
                </Badge>
              </div>
              <div className="text-[12px] text-fg-3 mt-1">{s.authority}</div>
              <div className="text-[12px] text-fg-2 mt-1">{s.note}</div>
            </div>
          ))}
        </div>
      </Surface>
      {[...groups.entries()].map(([name, list]) => (
        <Surface key={name} className="p-5">
          <SectionTitle
            kicker={`${list.length} evidencias`}
            right={list[0]?.demo ? <Badge tone="warning">DEMO</Badge> : null}
          >
            {name}
          </SectionTitle>
          <ul className="space-y-2">
            {list.map((e) => (
              <li key={e.id} className="text-[12px] border-t border-line pt-2 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <EvidenceBadge status={e.verificationStatus} />
                  <span className="text-fg-3">{e.sourceType}</span>
                  <span className="text-fg-3">· {e.geographicScope.label}</span>
                  <span className="text-fg-3 ml-auto num">
                    obtenido {formatDate(e.retrievedAt)}
                    {e.sourcePublishedAt ? ` · publicado ${formatDate(e.sourcePublishedAt)}` : ""}
                  </span>
                </div>
                <div className="text-fg mt-1">{e.excerpt}</div>
                <div className="text-fg-3 mt-0.5">
                  {e.sourceAuthority}
                  {e.sourceUrl ? (
                    <>
                      {" "}
                      ·{" "}
                      <a
                        className="underline underline-offset-2"
                        href={e.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        fuente
                      </a>
                    </>
                  ) : null}{" "}
                  · confianza {Math.round(e.confidence * 100)} % · <span className="font-mono">{e.id}</span>
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      ))}
    </div>
  );
}
