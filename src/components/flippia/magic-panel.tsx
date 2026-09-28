"use client";

import { useState } from "react";
import { Button, Money, Pct } from "@/components/ds";
import { api } from "@/lib/client";
import { cn } from "@/lib/cn";
import type { MagicReport } from "@/modules/analysis/magic";
import { LIAPulse } from "./visual/lia-pulse";

const LEVER: Record<string, string> = {
  price: "Precio",
  financing: "Financiación",
  timeline: "Plazo",
  transformation: "Transformación",
  tax: "Fiscalidad",
  exit: "Salida",
};

/** HAZ MAGIA: re-analyse the deal looking for reasonable improvements. */
export function MagicPanel({ dealId }: { dealId: string }) {
  const [report, setReport] = useState<MagicReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxDelta = report ? Math.max(1, ...report.improvements.map((i) => Math.abs(i.deltaProfit))) : 1;
  return (
    <section
      className={cn(
        "frame relative overflow-hidden border no-print transition-colors",
        report ? "border-accent/60 bg-surface" : "border-line bg-bg-2",
      )}
      aria-busy={busy || undefined}
    >
      {busy ? <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-accent/70 anim-scan" /> : null}
      <div className="p-5 md:p-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <LIAPulse state={busy ? "processing" : report ? "revealing" : "idle"} size={7} />
            <span className="kicker">Descubrir el potencial</span>
          </div>
          <div className="display-xl text-3xl md:text-5xl text-fg mt-3">
            Haz <span className="text-accent">magia</span>.
          </div>
          {!report && !error ? (
            <p className="text-sm text-fg-2 mt-3 max-w-xl">
              LIA vuelve a analizar el activo buscando maneras razonables de mejorar la operación: precio,
              transformación, financiación, plazo, fiscalidad y salida. Nunca falsea resultados: cada mejora
              lleva sus condiciones.
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-danger mt-3" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <Button
          variant="accent"
          size="lg"
          loading={busy}
          className="font-mono uppercase tracking-[0.16em] text-[12px] md:h-14 md:px-7"
          onClick={async () => {
            setBusy(true);
            setError(null);
            const r = await api<MagicReport>(`/api/deals/${dealId}/magic`, { method: "POST" });
            setBusy(false);
            if (r.ok && r.data) setReport(r.data);
            else setError(r.error?.message ?? "Error");
          }}
        >
          Haz magia
        </Button>
      </div>

      {report ? (
        <div className="border-t border-line p-5 md:p-6 space-y-6 anim-rise">
          <div className="font-display text-xl md:text-2xl text-fg">{report.headline}</div>
          {report.bestCombination ? (
            <div className="border border-accent/50 bg-accent-soft p-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <div className="kicker text-accent">Mejor combinación</div>
                <div className="text-fg mt-1">{report.bestCombination.description}</div>
              </div>
              <dl className="grid grid-cols-3 gap-4 md:text-right">
                <div>
                  <dt className="kicker">Beneficio</dt>
                  <dd className="font-display text-xl num">
                    <Money value={report.bestCombination.deltaProfit} signed />
                  </dd>
                </div>
                <div>
                  <dt className="kicker">ROE</dt>
                  <dd className="font-display text-xl num">
                    <Pct value={report.bestCombination.roe} />
                  </dd>
                </div>
                <div>
                  <dt className="kicker">Capital</dt>
                  <dd className="font-display text-xl num">
                    <Money value={report.bestCombination.equity} />
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
          <ol className="stagger divide-y divide-line border-y border-line">
            {report.improvements.map((i, k) => (
              <li key={i.key} className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 py-3 items-start">
                <span className="kicker num pt-1">{String(k + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="kicker text-accent">{LEVER[i.lever] ?? i.lever}</span>
                    <span className="text-sm text-fg">{i.title}</span>
                    <span className="kicker">· {i.strategyLabel}</span>
                  </div>
                  <p className="text-[12px] text-fg-2 mt-0.5">{i.detail}</p>
                  {i.conditions.length ? (
                    <p className="text-[11px] text-warning mt-1">Condiciones: {i.conditions.join(" ")}</p>
                  ) : null}
                  <div className="mt-2 h-1 w-full max-w-xs bg-bg-2 overflow-hidden" aria-hidden>
                    <div
                      className={cn("h-full", i.deltaProfit < 0 ? "bg-danger" : "bg-accent")}
                      style={{ width: `${(Math.abs(i.deltaProfit) / maxDelta) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display num text-lg">
                    <Money value={i.deltaProfit} signed />
                  </div>
                  {i.deltaRoe !== null ? (
                    <div className="kicker num">
                      ROE <Pct value={i.deltaRoe} signed />
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "font-mono text-[10px] tracking-[0.14em] mt-1",
                      i.status === "REVIEW_REQUIRED"
                        ? "text-review"
                        : i.status === "VERIFIED"
                          ? "text-verified"
                          : "text-inferred",
                    )}
                  >
                    {i.status === "REVIEW_REQUIRED" ? "REVIEW" : i.status}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <ul className="kicker normal-case tracking-normal space-y-0.5">
            {report.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
