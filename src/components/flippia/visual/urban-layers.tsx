import { cn } from "@/lib/cn";
import type { EvidenceStatus } from "@/modules/core/evidence-status";
import { EVIDENCE_STATUS_LABEL } from "@/modules/core/evidence-status";

/**
 * Urban Digital Layer — the parcel seen through its regulatory strata.
 *
 * Each layer is a slab in an exploded axonometric stack; its colour is the
 * evidence status the urbanism module already assigned. The page maps the
 * existing `UrbanismAssessment` into `UrbanLayer[]`; nothing is queried here.
 */
export interface UrbanLayer {
  key: string;
  label: string;
  value: string;
  status: EvidenceStatus | "POSSIBLE";
  note?: string;
}

const TONE: Record<UrbanLayer["status"], string> = {
  VERIFIED: "var(--color-verified)",
  INFERRED: "var(--color-inferred)",
  REVIEW_REQUIRED: "var(--color-review)",
  CONFLICT: "var(--color-conflict)",
  UNKNOWN: "var(--color-unknown)",
  POSSIBLE: "var(--color-accent)",
};

const SHORT: Record<UrbanLayer["status"], string> = {
  VERIFIED: "VERIFIED",
  INFERRED: "INFERRED",
  REVIEW_REQUIRED: "REVIEW",
  CONFLICT: "CONFLICT",
  UNKNOWN: "UNKNOWN",
  POSSIBLE: "POSSIBLE*",
};

export function UrbanLayerVisual({ layers, className }: { layers: UrbanLayer[]; className?: string }) {
  const n = layers.length;
  const w = 360;
  const slabH = 26;
  const gap = 22;
  const h = n * gap + slabH + 40;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("w-full h-auto max-w-[400px] mx-auto", className)}
      role="img"
      aria-label={`Capas urbanísticas: ${layers.map((l) => `${l.label} ${l.status}`).join(", ")}`}
    >
      {layers.map((l, i) => {
        const y = 20 + (n - 1 - i) * gap;
        const tone = TONE[l.status];
        // an isometric slab: a parallelogram top + a thin front face
        const top = `M110,${y + 14} L220,${y} L290,${y + 14} L180,${y + 28} Z`;
        return (
          <g key={l.key} className="anim-rise" style={{ animationDelay: `${i * 70}ms` }}>
            <path
              d={top}
              fill={tone}
              fillOpacity={0.14}
              stroke={tone}
              strokeWidth={1}
              strokeLinejoin="round"
            />
            <path
              d={`M110,${y + 14} L180,${y + 28} L180,${y + 32} L110,${y + 18} Z`}
              fill={tone}
              fillOpacity={0.28}
              stroke={tone}
              strokeWidth={0.6}
            />
            <path
              d={`M180,${y + 28} L290,${y + 14} L290,${y + 18} L180,${y + 32} Z`}
              fill={tone}
              fillOpacity={0.2}
              stroke={tone}
              strokeWidth={0.6}
            />
            <text
              x={298}
              y={y + 16}
              fontSize={7.5}
              fontFamily="var(--font-mono)"
              letterSpacing="0.14em"
              fill={tone}
            >
              {SHORT[l.status]}
            </text>
            <text
              x={102}
              y={y + 16}
              fontSize={8}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              letterSpacing="0.1em"
              fill="var(--color-text-secondary)"
            >
              {l.label.toUpperCase()}
            </text>
          </g>
        );
      })}
      {/* the parcel base */}
      <path
        d={`M110,${h - 18} L220,${h - 32} L290,${h - 18} L180,${h - 4} Z`}
        fill="var(--viz-parcel)"
        stroke="var(--viz-axis)"
        strokeDasharray="3 2"
        strokeWidth={0.8}
      />
      <text
        x={180}
        y={h - 8}
        fontSize={6.5}
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
        fill="var(--color-text-muted)"
        textAnchor="middle"
      >
        PARCELA
      </text>
    </svg>
  );
}

/** URBAN CHECK — the ledger. Label · value · status, monospaced. */
export function UrbanCheck({ layers, className }: { layers: UrbanLayer[]; className?: string }) {
  return (
    <table className={cn("w-full text-[13px]", className)}>
      <caption className="sr-only">Comprobación urbanística</caption>
      <thead>
        <tr className="kicker text-left">
          <th className="font-normal pb-2">Capa</th>
          <th className="font-normal pb-2">Lectura</th>
          <th className="font-normal pb-2 text-right">Estado</th>
        </tr>
      </thead>
      <tbody>
        {layers.map((l) => (
          <tr key={l.key} className="border-t border-line align-top">
            <td className="py-2 pr-3 text-fg whitespace-nowrap">{l.label}</td>
            <td className="py-2 pr-3 text-fg-2">
              {l.value}
              {l.note ? <span className="block text-[11px] text-fg-3">{l.note}</span> : null}
            </td>
            <td className="py-2 text-right whitespace-nowrap">
              <span
                className="font-mono text-[11px] tracking-[0.14em]"
                style={{ color: TONE[l.status] }}
                title={
                  l.status === "POSSIBLE"
                    ? "Posible, condicionado a comprobación"
                    : EVIDENCE_STATUS_LABEL[l.status].description
                }
              >
                {SHORT[l.status]}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
