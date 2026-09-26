"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Kicker, Surface } from "@/components/ds";
import { csrfToken } from "@/lib/client";
import type { AnalysisEvent } from "@/modules/agents/runtime/types";
import { AgentActivity, type TaskState } from "./agent-activity";

interface DoneEvent {
  dealId: string;
  analysisId: string;
  headline: string;
  strategies: number;
  durationMs: number;
}

/**
 * The magic moment: an address becomes an investment thesis, live. Streams
 * tasks and states from the orchestrator; when done, opens the Deal Room.
 */
export function AnalysisExperience({ text, dealId }: { text: string; dealId?: string }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskState[]>([]);
  const [status, setStatus] = useState<"connecting" | "running" | "done" | "error">("connecting");
  const [done, setDone] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const currentDeal = useRef<string | undefined>(dealId);
  const started = useRef(false);
  const queue = useRef<Array<() => void>>([]);
  const draining = useRef(false);
  const reduced =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  function enqueue(fn: () => void) {
    queue.current.push(fn);
    if (draining.current) return;
    draining.current = true;
    const step = () => {
      const next = queue.current.shift();
      if (!next) {
        draining.current = false;
        return;
      }
      next();
      setTimeout(step, reduced ? 0 : 110);
    };
    step();
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const ctrl = new AbortController();
    let settled = false;
    (async () => {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ text, dealId: currentDeal.current }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        setStatus("error");
        setError(
          res.status === 401
            ? "Sesión caducada. Vuelve a entrar."
            : res.status === 403
              ? "Tu rol no permite lanzar análisis."
              : res.status === 429
                ? "Hay demasiados análisis en curso o has alcanzado el límite por hora."
                : "No hemos podido iniciar el análisis.",
        );
        return;
      }
      setStatus("running");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const ev = chunk.match(/^event: (.+)$/m)?.[1];
          const data = chunk.match(/^data: (.+)$/m)?.[1];
          if (!ev || !data) continue;
          const payload = JSON.parse(data) as unknown;
          if (ev === "meta") {
            // Remember the deal so a retry or reload does not create a duplicate.
            const meta = payload as { dealId: string };
            if (meta.dealId && meta.dealId !== currentDeal.current) {
              currentDeal.current = meta.dealId;
              window.history.replaceState(
                null,
                "",
                `/app/analyze?q=${encodeURIComponent(text)}&deal=${encodeURIComponent(meta.dealId)}`,
              );
            }
          }
          // Real events, presented at a readable cadence (the engines are faster than the eye).
          if (ev === "agent") enqueue(() => applyEvent(payload as AnalysisEvent));
          if (ev === "done") {
            settled = true;
            enqueue(() => {
              setDone(payload as DoneEvent);
              setStatus("done");
            });
          }
          if (ev === "error") {
            settled = true;
            enqueue(() => {
              setError((payload as { message: string }).message);
              setStatus("error");
            });
          }
        }
      }
      if (!settled)
        enqueue(() => {
          setError("Conexión interrumpida antes de terminar el análisis.");
          setStatus("error");
        });
    })().catch((e) => {
      if ((e as Error).name === "AbortError") return;
      setStatus("error");
      setError("Conexión interrumpida.");
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  function retry() {
    setTasks([]);
    setError(null);
    setDone(null);
    setStatus("connecting");
    started.current = false;
    setAttempt((a) => a + 1);
  }

  function applyEvent(e: AnalysisEvent) {
    setTasks((prev) => {
      const next = [...prev];
      const upsert = (task: string, patch: Partial<TaskState>, seed?: Partial<TaskState>) => {
        const i = next.findIndex((t) => t.task === task);
        if (i >= 0) next[i] = { ...next[i]!, ...patch };
        else
          next.push({ task, label: task, domain: "core", status: "pending", ...seed, ...patch } as TaskState);
      };
      switch (e.type) {
        case "run.started":
          return e.plan.map((p) => ({
            task: p.type,
            label: p.label,
            domain: p.domain,
            status: "pending" as const,
          }));
        case "task.started":
          upsert(e.task, { status: "running", label: e.label, domain: e.domain });
          break;
        case "task.progress":
          upsert(e.task, { message: e.message });
          break;
        case "task.completed":
          upsert(e.task, { status: "completed", latencyMs: e.latencyMs, message: e.summary ?? undefined });
          break;
        case "task.failed":
          upsert(e.task, { status: "failed", message: e.error });
          break;
        case "task.skipped":
          upsert(e.task, { status: "skipped", message: e.reason });
          break;
      }
      return next;
    });
  }

  useEffect(() => {
    if (status === "done" && done) {
      const t = setTimeout(() => router.push(`/app/deals/${done.dealId}`), 1400);
      return () => clearTimeout(t);
    }
  }, [status, done, router]);

  const completed = tasks.filter((t) => t.status === "completed").length;
  return (
    <div className="max-w-3xl mx-auto anim-rise">
      <Kicker>LIA está construyendo el caso</Kicker>
      <h1 className="font-display text-2xl md:text-3xl mt-1 text-fg">{text}</h1>
      <div className="mt-6 h-1 rounded-full bg-surface-raised overflow-hidden" aria-hidden>
        <div
          className="h-full bg-accent transition-[width] duration-500"
          style={{ width: tasks.length ? `${(completed / tasks.length) * 100}%` : "4%" }}
        />
      </div>
      <div className="mt-6">
        <AgentActivity tasks={tasks} />
      </div>
      {status === "done" && done ? (
        <Surface raised className="mt-6 p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-accent mb-1">Resultado</div>
          <div className="font-display text-2xl text-fg">{done.headline}</div>
          <p className="text-sm text-fg-2 mt-1">
            {done.strategies} estrategias evaluadas en {(done.durationMs / 1000).toFixed(1)} s. Abriendo el
            Deal Room…
          </p>
          <Button variant="accent" className="mt-4" onClick={() => router.push(`/app/deals/${done.dealId}`)}>
            Abrir ahora
          </Button>
        </Surface>
      ) : null}
      {status === "error" ? (
        <Surface className="mt-6 p-5 border-danger/40">
          <div className="text-sm text-fg">{error}</div>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => router.push("/app")}>
              Volver
            </Button>
            <Button variant="accent" onClick={retry}>
              Reintentar
            </Button>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
