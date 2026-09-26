import { labelRunStatus } from "@/lib/labels";
import { SectionTitle, Surface } from "@/components/ds";
import { formatDate } from "@/lib/format";
import { loadDeal } from "@/server/deal-page";
import { listDealActivity } from "@/server/services/deals";

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, analysis } = await loadDeal(id);
  const items = await listDealActivity(ctx, id);
  return (
    <div className="space-y-6">
      <Surface className="p-5">
        <SectionTitle kicker="Cronología del deal">Actividad</SectionTitle>
        <ol className="relative border-l border-line ml-2 space-y-4">
          {items.map((a) => (
            <li key={a.id} className="pl-4">
              <span className="absolute -left-[5px] mt-1.5 size-2 rounded-full bg-accent" aria-hidden />
              <div className="text-[11px] text-fg-3 num">
                {formatDate(a.createdAt)} · {a.kind}
              </div>
              <div className="text-sm text-fg">{a.title}</div>
            </li>
          ))}
        </ol>
      </Surface>
      {analysis ? (
        <Surface className="p-5">
          <SectionTitle kicker="Observabilidad de agentes">Ejecución del análisis</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-fg-3">
                  <th className="py-1 font-normal">Agente</th>
                  <th className="py-1 font-normal">Dominio</th>
                  <th className="py-1 font-normal">Estado</th>
                  <th className="py-1 font-normal text-right">Latencia</th>
                  <th className="py-1 font-normal text-right">Tools</th>
                  <th className="py-1 font-normal text-right">Evidencia</th>
                  <th className="py-1 font-normal text-right">Intentos</th>
                </tr>
              </thead>
              <tbody>
                {analysis.agentRuns.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-1 font-mono">{r.agentType}</td>
                    <td className="py-1">{r.domain}</td>
                    <td className={r.status === "completed" ? "py-1 text-success" : "py-1 text-danger"}>
                      {labelRunStatus(r.status)}
                    </td>
                    <td className="py-1 text-right num">{r.latencyMs} ms</td>
                    <td className="py-1 text-right num">{r.toolCalls.length}</td>
                    <td className="py-1 text-right num">{r.evidenceIds.length}</td>
                    <td className="py-1 text-right num">{r.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[11px] text-fg-3">
            Duración total {analysis.durationMs} ms · {analysis.agentRuns.length} agentes ·{" "}
            {analysis.failedAgents.length} fallos.
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
