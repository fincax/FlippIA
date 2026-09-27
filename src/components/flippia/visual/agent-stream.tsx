"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { AgentDomain } from "@/modules/agents/runtime/types";
import type { TaskState } from "@/components/flippia/agent-activity";
import { LIAPulse } from "./lia-pulse";

/**
 * AgentStreamVisual — the FlippIA Scan.
 *
 * Left: the layers of the asset (PROPERTY · CADASTRE · URBANISM · MARKET ·
 * ARCHITECTURE · FINANCE · RISK …) lit as the real orchestrator works them.
 * Right: the intelligence stream, a timestamped log of the real task states.
 *
 * Presentational. `tasks` is the exact state the analysis already streams; the
 * component only adds a client-side clock (seconds since it mounted) so the
 * log reads like a control room. It never invents a task or a state.
 */

const LAYERS: Array<{ key: string; label: string; domains: AgentDomain[] }> = [
  { key: "property", label: "Activo", domains: ["opportunity", "data"] },
  { key: "market", label: "Mercado", domains: ["market"] },
  { key: "urbanism", label: "Urbanismo", domains: ["urbanism", "regulatory", "legal"] },
  { key: "architecture", label: "Arquitectura", domains: ["architecture", "construction"] },
  { key: "finance", label: "Financiación", domains: ["finance", "tax", "investment"] },
  { key: "risk", label: "Riesgo", domains: ["risk"] },
  { key: "exit", label: "Salida", domains: ["exit", "sales", "acquisition", "execution"] },
  { key: "core", label: "Síntesis", domains: ["core", "learning"] },
];

type LayerStatus = "pending" | "running" | "partial" | "completed" | "failed" | "skipped";

function layerStatus(list: TaskState[]): LayerStatus {
  if (!list.length) return "pending";
  if (list.some((t) => t.status === "running")) return "running";
  if (list.some((t) => t.status === "failed")) return "failed";
  if (list.every((t) => t.status === "completed" || t.status === "skipped"))
    return list.every((t) => t.status === "skipped") ? "skipped" : "completed";
  if (list.some((t) => t.status === "completed")) return "partial";
  return "pending";
}

const VERB: Record<TaskState["status"], string> = {
  pending: "en cola",
  running: "trabajando",
  completed: "completado",
  failed: "fallo",
  skipped: "omitido",
};

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

interface Line {
  key: string;
  at: number;
  text: string;
  status: TaskState["status"];
  detail?: string;
}

export function AgentStreamVisual({ tasks, className }: { tasks: TaskState[]; className?: string }) {
  // Client clock for the stream: a ticker (external system → state in a
  // callback). Lines are derived during render from `tasks`, the documented
  // pattern for state that depends on props; nothing is stamped in an effect.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - started), 250);
    return () => clearInterval(id);
  }, []);
  const [prev, setPrev] = useState<TaskState[]>(tasks);
  const [seen, setSeen] = useState<Record<string, TaskState["status"]>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const logRef = useRef<HTMLOListElement>(null);

  if (tasks !== prev) {
    setPrev(tasks);
    const now = elapsed;
    const nextSeen = { ...seen };
    const fresh: Line[] = [];
    for (const t of tasks) {
      if (nextSeen[t.task] === t.status) continue;
      nextSeen[t.task] = t.status;
      if (t.status === "pending") continue;
      fresh.push({
        key: `${t.task}:${t.status}`,
        at: now,
        text: t.label,
        status: t.status,
        detail: t.message,
      });
    }
    setSeen(nextSeen);
    if (fresh.length) setLines([...lines, ...fresh]);
  }

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const byLayer = LAYERS.map((layer) => {
    const list = tasks.filter((t) => layer.domains.includes(t.domain));
    const done = list.filter((t) => t.status === "completed" || t.status === "skipped").length;
    return { ...layer, list, done, status: layerStatus(list) };
  }).filter((l) => l.list.length || !tasks.length);

  const running = tasks.find((t) => t.status === "running");
  const completed = tasks.filter((t) => t.status === "completed").length;

  return (
    <div
      className={cn("grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]", className)}
      aria-live="polite"
    >
      {/* ── Layers ────────────────────────────────────────────────────── */}
      <div className="frame border border-line bg-surface/70 p-4 md:p-5">
        <div className="flex items-center justify-between">
          <span className="kicker">Capas del activo</span>
          <span className="kicker num text-fg-2">{tasks.length ? `${completed}/${tasks.length}` : "—"}</span>
        </div>
        <ol className="mt-4 space-y-1.5">
          {byLayer.map((l, i) => (
            <li
              key={l.key}
              className={cn(
                "grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-l-2 pl-3 py-1.5 transition-colors duration-300",
                l.status === "completed" && "border-verified",
                l.status === "running" && "border-accent",
                l.status === "partial" && "border-accent/50",
                l.status === "failed" && "border-danger",
                l.status === "skipped" && "border-line-strong",
                l.status === "pending" && "border-line",
              )}
            >
              <span className="kicker num text-fg-3">{String(i + 1).padStart(2, "0")}</span>
              <span
                className={cn(
                  "font-display text-sm md:text-[15px] uppercase tracking-[0.06em] truncate",
                  l.status === "pending" ? "text-fg-3" : "text-fg",
                )}
              >
                {l.label}
              </span>
              <LayerGlyph status={l.status} done={l.done} total={l.list.length} />
            </li>
          ))}
        </ol>
        {running ? (
          <div className="mt-4 flex items-center gap-2 text-[12px] text-fg-2 min-w-0">
            <LIAPulse state="processing" size={7} />
            <span className="truncate">{running.label}</span>
          </div>
        ) : null}
      </div>

      {/* ── Stream ────────────────────────────────────────────────────── */}
      <div className="frame border border-line bg-bg-2/60 p-4 md:p-5 min-h-[260px] flex flex-col">
        <div className="flex items-center justify-between">
          <span className="kicker">Intelligence stream</span>
          <span className="kicker text-fg-3">tiempo desde el inicio</span>
        </div>
        <ol
          ref={logRef}
          className="mt-3 flex-1 max-h-[46vh] md:max-h-[420px] overflow-y-auto font-mono text-[12px] leading-[1.7] space-y-0.5 pr-1"
        >
          {!lines.length ? (
            <li className="text-fg-3 flex items-center gap-2">
              <span className="num">00:00</span>
              <span className="anim-pulse">Conectando con los orquestadores…</span>
            </li>
          ) : null}
          {lines.map((l) => (
            <li
              key={l.key}
              className="grid grid-cols-[42px_10px_minmax(0,1fr)] gap-2 items-baseline anim-rise"
            >
              <span className="num text-fg-3">{mmss(l.at)}</span>
              <span
                aria-hidden
                className={cn(
                  "inline-block size-1.5 rounded-full translate-y-[-1px]",
                  l.status === "completed" && "bg-verified",
                  l.status === "running" && "bg-accent anim-pulse",
                  l.status === "failed" && "bg-danger",
                  l.status === "skipped" && "bg-fg-3/50",
                )}
              />
              <span className="min-w-0">
                <span className={cn(l.status === "failed" ? "text-danger" : "text-fg")}>{l.text}</span>
                <span className="text-fg-3"> · {VERB[l.status]}</span>
                {l.detail ? <span className="block text-fg-3 truncate">{l.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function LayerGlyph({ status, done, total }: { status: LayerStatus; done: number; total: number }) {
  return (
    <span
      aria-label={status}
      className={cn(
        "kicker num",
        status === "completed" && "text-verified",
        status === "running" && "text-accent",
        status === "partial" && "text-fg-2",
        status === "failed" && "text-danger",
        status === "skipped" && "text-fg-3",
        status === "pending" && "text-fg-3/60",
      )}
    >
      {status === "completed"
        ? "OK"
        : status === "running"
          ? "···"
          : status === "failed"
            ? "ERR"
            : status === "skipped"
              ? "—"
              : status === "partial"
                ? `${done}/${total}`
                : "··"}
    </span>
  );
}
