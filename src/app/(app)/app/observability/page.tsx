import { labelRunStatus } from "@/lib/labels";
import { Badge, SectionTitle, Surface } from "@/components/ds";
import { formatDate } from "@/lib/format";
import { sourceStatuses } from "@/modules/adapters/registry";
import { aiProvider } from "@/modules/ai/provider";
import { enabledFlags, FEATURE_FLAGS } from "@/modules/core/flags";
import { tenantContext } from "@/server/auth/current";
import { agentStats } from "@/server/services/observability";

export const dynamic = "force-dynamic";

export default async function ObservabilityPage() {
  const { ctx } = await tenantContext();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return (
      <Surface className="p-8 max-w-xl">
        <div className="text-[11px] uppercase tracking-[0.18em] text-fg-3">Agentes</div>
        <h1 className="font-display text-xl mt-2">Este panel es solo para administradores.</h1>
        <p className="text-sm text-fg-2 mt-2">Pide acceso a la persona responsable de tu organización.</p>
      </Surface>
    );
  }
  const [stats, sources] = await Promise.all([agentStats(ctx), sourceStatuses()]);
  const ai = aiProvider();
  const flags = enabledFlags();
  return (
    <div className="space-y-8">
      <div>
        <SectionTitle kicker="Agent observability">La organización agéntica</SectionTitle>
        <p className="text-sm text-fg-2 max-w-3xl">
          Cada análisis es un plan de agentes con dependencias, presupuesto de tiempo y reintentos. Aquí se ve
          qué se ejecuta, cuánto tarda, qué falla y qué evidencia genera.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Surface className="p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Proveedor de IA</div>
          <div className="text-lg mt-1">
            {ai.id}{" "}
            <Badge tone={ai.available ? "success" : "warning"}>
              {ai.available ? ai.model : "determinista"}
            </Badge>
          </div>
          <p className="text-[12px] text-fg-3 mt-1">
            {ai.available
              ? "El modelo redacta narrativa sobre hechos calculados."
              : "Sin clave: LIA usa plantillas deterministas; todo lo demás funciona."}
          </p>
        </Surface>
        <Surface className="p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Feature flags</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {FEATURE_FLAGS.map((f) => (
              <Badge key={f} tone={flags.has(f) ? "success" : "neutral"}>
                {f}
              </Badge>
            ))}
          </div>
        </Surface>
        <Surface className="p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Fuentes</div>
          <ul className="mt-1 text-[12px] space-y-0.5">
            {sources.map((s) => (
              <li key={s.sourceId} className="flex justify-between gap-2">
                <span className="truncate">{s.name}</span>
                <Badge tone={s.available ? (s.demo ? "warning" : "success") : "danger"}>{s.mode}</Badge>
              </li>
            ))}
          </ul>
        </Surface>
      </div>
      <Surface className="p-5">
        <SectionTitle kicker="Últimos 30 días">Por agente</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="py-1 font-normal">Agente</th>
                <th className="py-1 font-normal">Dominio</th>
                <th className="py-1 font-normal text-right">Runs</th>
                <th className="py-1 font-normal text-right">Fallos</th>
                <th className="py-1 font-normal text-right">Latencia media</th>
                <th className="py-1 font-normal text-right">Tools</th>
                <th className="py-1 font-normal text-right">Evidencia</th>
              </tr>
            </thead>
            <tbody>
              {stats.byAgent.map((r) => (
                <tr key={r.agentType} className="border-t border-line">
                  <td className="py-1 font-mono">{r.agentType}</td>
                  <td className="py-1">{r.domain}</td>
                  <td className="py-1 text-right num">{r.runs}</td>
                  <td className={`py-1 text-right num ${r.failures ? "text-danger" : ""}`}>{r.failures}</td>
                  <td className="py-1 text-right num">{r.avgLatency} ms</td>
                  <td className="py-1 text-right num">{r.tools}</td>
                  <td className="py-1 text-right num">{r.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!stats.byAgent.length ? (
          <p className="text-sm text-fg-2">
            Sin ejecuciones todavía. Analiza un inmueble para ver a la organización trabajar.
          </p>
        ) : null}
      </Surface>
      <Surface className="p-5">
        <SectionTitle kicker="Recientes">Ejecuciones</SectionTitle>
        <ul className="text-[12px] space-y-1">
          {stats.recent.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-2 border-t border-line py-1">
              <span className="num text-fg-3">{formatDate(r.startedAt)}</span>
              <span className="font-mono">{r.agentType}</span>
              <span className={r.status === "completed" ? "text-success" : "text-danger"}>
                {labelRunStatus(r.status)}
              </span>
              <span className="num text-fg-3">{r.latencyMs} ms</span>
              <span className="text-fg-3 truncate">{r.dealId ?? ""}</span>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}
