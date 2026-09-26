"use client";

import { useState } from "react";
import { Badge, Button, Money, Pct, SectionTitle, Surface } from "@/components/ds";
import { api } from "@/lib/client";
import type { MagicReport } from "@/modules/analysis/magic";

/** HAZ MAGIA: re-analyse the deal looking for reasonable improvements. */
export function MagicPanel({ dealId }: { dealId: string }) {
  const [report, setReport] = useState<MagicReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Surface className="p-5 no-print">
      <SectionTitle
        kicker="Discover potential"
        right={
          <Button
            variant="accent"
            loading={busy}
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
        }
      >
        ¿Se puede mejorar esta operación?
      </SectionTitle>
      {!report && !error ? (
        <p className="text-sm text-fg-2">
          LIA vuelve a analizar el activo buscando maneras razonables de mejorar la operación: precio,
          transformación, financiación, plazo, fiscalidad y salida. Nunca falsea resultados: cada mejora lleva
          sus condiciones.
        </p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {report ? (
        <div className="space-y-4 anim-rise">
          <div className="font-display text-xl">{report.headline}</div>
          {report.bestCombination ? (
            <div className="rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft p-3 text-sm">
              <div className="text-[11px] uppercase tracking-[0.14em] text-accent mb-1">
                Mejor combinación
              </div>
              <div className="text-fg">{report.bestCombination.description}</div>
              <div className="mt-1 text-fg-2">
                Beneficio <Money value={report.bestCombination.deltaProfit} signed /> · ROE{" "}
                <Pct value={report.bestCombination.roe} /> · capital{" "}
                <Money value={report.bestCombination.equity} />
              </div>
            </div>
          ) : null}
          <ul className="space-y-2">
            {report.improvements.map((i) => (
              <li key={i.key} className="rounded-[var(--radius-md)] border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-fg">
                      {i.title} <span className="text-fg-3">· {i.strategyLabel}</span>
                    </div>
                    <p className="text-[12px] text-fg-2 mt-0.5">{i.detail}</p>
                    {i.conditions.length ? (
                      <p className="text-[11px] text-warning mt-1">Condiciones: {i.conditions.join(" ")}</p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display num text-lg">
                      <Money value={i.deltaProfit} signed />
                    </div>
                    {i.deltaRoe !== null ? (
                      <div className="text-[11px] text-fg-3">
                        ROE <Pct value={i.deltaRoe} signed />
                      </div>
                    ) : null}
                    <Badge tone={i.status === "REVIEW_REQUIRED" ? "warning" : "info"} className="mt-1">
                      {i.status === "REVIEW_REQUIRED" ? "Requiere revisión" : "Inferido"}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <ul className="text-[11px] text-fg-3 list-disc pl-4">
            {report.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Surface>
  );
}
