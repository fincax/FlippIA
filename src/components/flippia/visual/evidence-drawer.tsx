"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { EvidenceStatus } from "@/modules/core/evidence-status";
import { EVIDENCE_STATUS_LABEL } from "@/modules/core/evidence-status";

/**
 * EvidenceDrawerVisual — "SHOW EVIDENCE".
 *
 * A conclusion opens a side panel with the evidence the analysis already
 * carries. When the current data contract attaches no evidence to that
 * conclusion, the drawer says so explicitly instead of inventing one.
 * Presentational: the page decides which `items` belong to the conclusion.
 */
export interface EvidenceItem {
  id: string;
  sourceName: string;
  sourceAuthority: string;
  sourceUrl?: string;
  retrievedAt: string;
  sourcePublishedAt?: string;
  excerpt?: string;
  confidence: number;
  verificationStatus: EvidenceStatus;
  demo: boolean;
}

const TONE: Record<EvidenceStatus, string> = {
  VERIFIED: "text-verified",
  INFERRED: "text-inferred",
  REVIEW_REQUIRED: "text-review",
  CONFLICT: "text-conflict",
  UNKNOWN: "text-unknown",
};

export function EvidenceDrawer({
  title,
  items,
  label = "Ver evidencia",
  className,
}: {
  title: string;
  items: EvidenceItem[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => panel.current?.focus(), 20);
    const opener = trigger.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          "inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase text-fg-2 hover:text-fg border border-line hover:border-line-strong px-2.5 py-1.5 transition-colors",
          className,
        )}
      >
        <span aria-hidden className="inline-block size-1.5 bg-current" />
        {label}
        <span className="num text-fg-3">{items.length}</span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/55" />
          <div
            id={id}
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal
            aria-label={`Evidencia · ${title}`}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 inset-y-0 w-full max-w-[520px] bg-bg-2 border-l border-line shadow-[var(--shadow-drawer)] overflow-y-auto anim-rise outline-none"
          >
            <div className="sticky top-0 bg-bg-2/95 backdrop-blur border-b border-line px-5 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="kicker">Show evidence</div>
                <div className="font-display text-lg text-fg mt-1 truncate">{title}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="kicker text-fg-2 hover:text-fg border border-line px-2 py-1"
              >
                esc
              </button>
            </div>
            <div className="px-5 py-4">
              {items.length ? (
                <ol className="space-y-4">
                  {items.map((e, i) => (
                    <li key={e.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="kicker num">{String(i + 1).padStart(2, "0")}</span>
                        <span
                          className={cn(
                            "font-mono text-[11px] tracking-[0.14em]",
                            TONE[e.verificationStatus],
                          )}
                        >
                          {EVIDENCE_STATUS_LABEL[e.verificationStatus].es.toUpperCase()}
                        </span>
                        {e.demo ? <span className="kicker text-warning">demo</span> : null}
                        <span className="kicker ml-auto num">
                          obtenido {formatDate(e.retrievedAt)}
                          {e.sourcePublishedAt ? ` · publicado ${formatDate(e.sourcePublishedAt)}` : ""}
                        </span>
                      </div>
                      <div className="text-sm text-fg mt-1.5">{e.excerpt ?? "Sin extracto."}</div>
                      <div className="text-[12px] text-fg-3 mt-1">
                        {e.sourceName} · {e.sourceAuthority} · confianza {Math.round(e.confidence * 100)} %
                        {e.sourceUrl ? (
                          <>
                            {" "}
                            ·{" "}
                            <a
                              href={e.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2 hover:text-fg"
                            >
                              fuente
                            </a>
                          </>
                        ) : null}
                        <span className="block font-mono text-[10px] mt-0.5">{e.id}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="border border-dashed border-line p-5">
                  <div className="kicker text-warning">Evidence not available in current data contract</div>
                  <p className="text-sm text-fg-2 mt-2">
                    Esta conclusión no lleva evidencias enlazadas en el análisis actual. La pestaña Evidencia
                    recoge todas las fuentes consultadas.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
