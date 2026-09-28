import { cn } from "@/lib/cn";
import type { AgentDomain } from "@/modules/agents/runtime/types";

export interface TaskState {
  task: string;
  label: string;
  domain: AgentDomain;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  message?: string;
  latencyMs?: number;
  /** Orchestrator timestamp of the last state change (ISO). */
  at?: string;
}

const DOMAIN_LABEL: Partial<Record<AgentDomain, string>> = {
  opportunity: "Oportunidad",
  data: "Datos",
  market: "Mercado",
  regulatory: "Normativa",
  urbanism: "Urbanismo",
  architecture: "Arquitectura",
  finance: "Financiación",
  investment: "Inversión",
  risk: "Riesgo",
  exit: "Salida",
  core: "Core",
};

/** AgentActivity: tasks, states, evidence. Never private reasoning. */
export function AgentActivity({ tasks, compact }: { tasks: TaskState[]; compact?: boolean }) {
  if (!tasks.length) {
    return (
      <div className="space-y-2" aria-live="polite">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 rounded-[var(--radius-md)] bg-surface relative overflow-hidden">
            <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/5 to-transparent anim-sweep" />
          </div>
        ))}
      </div>
    );
  }
  const groups = new Map<AgentDomain, TaskState[]>();
  for (const t of tasks) groups.set(t.domain, [...(groups.get(t.domain) ?? []), t]);
  return (
    <div className={cn("grid gap-3", compact ? "" : "sm:grid-cols-2")} aria-live="polite">
      {[...groups.entries()].map(([domain, list]) => (
        <div key={domain} className="rounded-[var(--radius-md)] border border-line bg-surface p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-fg-3 mb-2">
            {DOMAIN_LABEL[domain] ?? domain}
          </div>
          <ul className="space-y-1.5">
            {list.map((t) => (
              <li key={t.task} className="flex items-start gap-2 text-[13px]">
                <StatusDot status={t.status} />
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "truncate",
                      t.status === "completed" ? "text-fg" : t.status === "running" ? "text-fg" : "text-fg-2",
                    )}
                  >
                    {t.label}
                    {t.status === "running" ? "…" : t.status === "completed" ? " ✓" : ""}
                  </div>
                  {t.message ? <div className="text-[12px] text-fg-3 truncate">{t.message}</div> : null}
                </div>
                {t.latencyMs !== undefined ? (
                  <span className="num text-[11px] text-fg-3">{t.latencyMs} ms</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: TaskState["status"] }) {
  return (
    <span
      aria-label={status}
      className={cn(
        "mt-1.5 size-2 rounded-full shrink-0",
        status === "completed" && "bg-success",
        status === "running" && "bg-accent anim-pulse",
        status === "failed" && "bg-danger",
        status === "skipped" && "bg-fg-3/40",
        status === "pending" && "bg-surface-hover border border-line-strong",
      )}
    />
  );
}
