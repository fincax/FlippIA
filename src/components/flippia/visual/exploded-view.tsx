import Link from "next/link";
import { cn } from "@/lib/cn";
import type { EvidenceStatus } from "@/modules/core/evidence-status";

/**
 * ExplodedInvestmentView — the asset as strata.
 *
 *   VALUE · FINANCE · REFORM · ARCHITECTURE · URBANISM · PROPERTY
 *
 * Each layer opens the Deal Room tab that already exists. The status colour is
 * the evidence status the analysis already assigned to that domain.
 */
export interface InvestmentLayer {
  key: string;
  label: string;
  headline: string;
  detail?: string;
  href: string;
  status?: EvidenceStatus | "RISK_LOW" | "RISK_MEDIUM" | "RISK_HIGH";
}

const TONE: Record<NonNullable<InvestmentLayer["status"]>, string> = {
  VERIFIED: "var(--color-verified)",
  INFERRED: "var(--color-inferred)",
  REVIEW_REQUIRED: "var(--color-review)",
  CONFLICT: "var(--color-conflict)",
  UNKNOWN: "var(--color-unknown)",
  RISK_LOW: "var(--color-verified)",
  RISK_MEDIUM: "var(--color-warning)",
  RISK_HIGH: "var(--color-danger)",
};

export function ExplodedInvestmentView({
  layers,
  className,
}: {
  layers: InvestmentLayer[];
  className?: string;
}) {
  return (
    <ol className={cn("stagger relative", className)} aria-label="Capas de la inversión">
      {layers.map((l, i) => {
        const tone = l.status ? TONE[l.status] : "var(--viz-axis)";
        return (
          <li key={l.key} className="relative">
            <Link
              href={l.href}
              className="group grid grid-cols-[64px_minmax(0,1fr)_auto] gap-4 items-center border-t border-line py-3 md:py-3.5 hover:bg-surface-hover/60 transition-colors -mx-2 px-2"
            >
              <span className="relative block h-9" aria-hidden>
                <svg viewBox="0 0 64 36" className="absolute inset-0 w-full h-full">
                  <path
                    d="M6,22 L32,8 L58,22 L32,36 Z"
                    fill={tone}
                    fillOpacity={0.14}
                    stroke={tone}
                    strokeWidth={1}
                    strokeLinejoin="round"
                    style={{ transform: `translateY(${-i * 0}px)` }}
                  />
                  <path d="M6,22 L32,36 L32,40 L6,26 Z" fill={tone} fillOpacity={0.3} />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-3">
                  <span className="kicker num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-display uppercase tracking-[0.06em] text-sm text-fg">{l.label}</span>
                </span>
                <span className="block text-[13px] text-fg-2 mt-0.5 truncate">{l.headline}</span>
                {l.detail ? <span className="block text-[11px] text-fg-3 truncate">{l.detail}</span> : null}
              </span>
              <span className="kicker text-fg-3 group-hover:text-fg transition-colors">abrir →</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
