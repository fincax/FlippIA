"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ds";
import { cn } from "@/lib/cn";
import { csrfToken } from "@/lib/client";
import type { AnalysisEvent } from "@/modules/agents/runtime/types";
import { microzoneFromText } from "@/modules/city/registry";
import { SEVILLA } from "@/modules/city/sevilla";
import type { TaskState } from "./agent-activity";
import { AgentStreamVisual } from "./visual/agent-stream";
import { CityCanvas } from "./visual/city-canvas";
import { LIAPulse } from "./visual/lia-pulse";

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
    // Deferred by a tick: React's development double-mount runs effect → cleanup → effect
    // synchronously, so the first (immediately cancelled) mount never issues a request.
    const ctrl = new AbortController();
    let cancelled = false;
    let settled = false;
    const start = async () => {
      if (cancelled) return;
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
      if (!settled && !cancelled)
        enqueue(() => {
          setError("Conexión interrumpida antes de terminar el análisis.");
          setStatus("error");
        });
    };
    const timer = setTimeout(() => {
      start().catch((e) => {
        if ((e as Error).name === "AbortError" || cancelled) return;
        setStatus("error");
        setError("Conexión interrumpida.");
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  function retry() {
    setTasks([]);
    setError(null);
    setDone(null);
    setStatus("connecting");
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
  const failed = tasks.filter((t) => t.status === "failed").length;
  const progress = tasks.length ? completed / tasks.length : 0;
  // Visual stage of the scan: the city closes in as the real work advances.
  const stage: "city" | "district" | "parcel" | "asset" =
    status === "done" ? "asset" : progress > 0.55 ? "parcel" : tasks.length ? "district" : "city";
  const zoom = { city: 1.4, district: 2.6, parcel: 5.5, asset: 7 }[stage];
  // Where the city closes in: the existing alias resolver, used only to aim the drawing.
  const focus = useMemo(() => {
    const zone = microzoneFromText(SEVILLA, text);
    return zone ? { microzoneId: zone.id } : { lat: SEVILLA.centroid.lat, lng: SEVILLA.centroid.lng };
  }, [text]);
  const located = "microzoneId" in focus;
  const liaState = status === "error" ? "alert" : status === "done" ? "revealing" : "processing";

  return (
    <div className="relative -mx-4 md:-mx-8 -mt-6 md:-mt-8">
      {/* ── the city closing in ──────────────────────────────────────── */}
      <div className="relative h-[34vh] min-h-[220px] md:h-[40vh] overflow-hidden border-b border-line">
        <div className="absolute inset-0 vignette" aria-hidden>
          <CityCanvas
            zoom={zoom}
            focus={focus}
            marker={located && stage !== "city"}
            scanning={status === "connecting" || status === "running"}
            labels={stage === "city"}
          />
        </div>
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,12,11,0.2)_0%,rgba(12,12,11,0)_40%,var(--color-bg-primary)_100%)]"
        />
        <div className="absolute inset-x-0 top-0 px-4 md:px-8 pt-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <LIAPulse state={liaState} size={8} />
            <span className="kicker">LIA está construyendo el caso</span>
          </div>
          <ol className="hidden sm:flex items-center kicker" aria-label="Foco">
            {(["city", "district", "parcel", "asset"] as const).map((s, i, a) => (
              <li key={s} className="flex items-center">
                <span className={cn(s === stage ? "text-accent" : "text-fg-3")}>
                  {{ city: "Ciudad", district: "Barrio", parcel: "Parcela", asset: "Activo" }[s]}
                </span>
                {i < a.length - 1 ? <span aria-hidden className="mx-2 h-px w-5 bg-line-strong" /> : null}
              </li>
            ))}
          </ol>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-4 md:px-8 pb-5">
          <h1 className="font-display text-xl md:text-3xl text-fg max-w-4xl leading-tight">{text}</h1>
          <div className="mt-3 flex items-center gap-4">
            <div className="h-px flex-1 bg-line relative overflow-visible" aria-hidden>
              <div
                className="absolute inset-y-[-1px] left-0 bg-accent transition-[width] duration-500"
                style={{ width: tasks.length ? `${progress * 100}%` : "3%" }}
              />
            </div>
            <span className="kicker num text-fg-2">
              {tasks.length ? `${completed}/${tasks.length}` : "··"}
              {failed ? <span className="text-danger"> · {failed} fallo</span> : null}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl space-y-6">
        {status === "connecting" || (status === "running" && tasks.length === 0) ? (
          <p className="text-sm text-fg-2 max-w-2xl" role="status">
            Preparando el análisis. Las fuentes públicas del Catastro y de la Gerencia de Urbanismo pueden
            tardar hasta un minuto en responder.
          </p>
        ) : null}

        <AgentStreamVisual tasks={tasks} />

        {status === "done" && done ? (
          <div className="frame border border-accent/50 bg-surface p-5 md:p-7 anim-rise">
            <div className="flex items-center gap-3">
              <LIAPulse state="revealing" size={8} />
              <span className="kicker text-accent">Resultado</span>
            </div>
            <div className="display-xl text-3xl md:text-5xl text-fg mt-4 max-w-4xl">{done.headline}</div>
            <p className="text-sm text-fg-2 mt-4">
              {done.strategies} estrategias evaluadas en {(done.durationMs / 1000).toFixed(1)} s. Abriendo el
              Deal Room…
            </p>
            <Button
              variant="accent"
              className="mt-5"
              onClick={() => router.push(`/app/deals/${done.dealId}`)}
            >
              Abrir ahora
            </Button>
          </div>
        ) : null}
        {status === "error" ? (
          <div className="frame border border-danger/50 bg-surface p-5 anim-rise" role="alert">
            <div className="flex items-center gap-3 mb-2">
              <LIAPulse state="alert" size={7} />
              <span className="kicker text-danger">Interrumpido</span>
            </div>
            <div className="text-sm text-fg">{error}</div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => router.push("/app")}>
                Volver
              </Button>
              <Button variant="accent" onClick={retry}>
                Reintentar
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
