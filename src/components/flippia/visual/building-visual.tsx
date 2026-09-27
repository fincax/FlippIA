import { cn } from "@/lib/cn";

/**
 * BuildingVisual — a conceptual axonometric of the asset.
 *
 * FlippIA holds no building geometry today (see DESIGN_DEPENDENCIES.md). This
 * drawing is a diagram built from the counts the analysis does have (floors
 * allowed by planning, current programme, units). It is always labelled as a
 * conceptual representation and never claims to be the building.
 *
 * Stages: current → transformation → future. The future draws the programme
 * of the selected alternative; the transformation stage highlights the delta.
 */
export function BuildingVisual({
  stage = "current",
  floors = 3,
  maxFloors,
  units = 1,
  futureUnits,
  label,
  className,
}: {
  stage?: "current" | "transformation" | "future";
  /** Floors drawn for the current state (a diagram, not a survey). */
  floors?: number;
  /** Maximum floors allowed by planning, drawn as a dashed envelope. */
  maxFloors?: number | null;
  units?: number;
  futureUnits?: number;
  label?: string;
  className?: string;
}) {
  const w = 220;
  const fh = 18; // floor height
  const F = Math.max(1, Math.min(8, floors));
  const M = maxFloors ? Math.max(F, Math.min(9, maxFloors)) : null;
  const baseY = 170;
  const h = 200;
  // isometric footprint: front-left corner at (60, baseY)
  const dx = 70;
  const dy = 22;
  const front = (y: number) => `M60,${y} L130,${y + dy} L130,${y + dy - fh} L60,${y - fh} Z`;
  const side = (y: number) => `M130,${y + dy} L200,${y} L200,${y - fh} L130,${y + dy - fh} Z`;
  const top = (y: number) => `M60,${y - fh} L130,${y + dy - fh} L200,${y - fh} L130,${y - dy - fh} Z`;
  const accent = stage !== "current";
  const stroke = accent ? "var(--color-accent)" : "var(--viz-axis)";
  const U = stage === "current" ? units : (futureUnits ?? units);
  return (
    <figure className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto max-w-[280px] mx-auto"
        role="img"
        aria-label={label ?? "Volumen conceptual del activo"}
      >
        {/* plot */}
        <path
          d={`M40,${baseY + 6} L130,${baseY + dy + 12} L220,${baseY + 6} L130,${baseY - dy} Z`}
          fill="var(--viz-parcel)"
          stroke="var(--viz-parcel-line)"
          strokeWidth={0.8}
        />
        {/* envelope allowed by planning */}
        {M && M > F ? (
          <g opacity={0.7}>
            <path
              d={`M60,${baseY - M * fh} L130,${baseY + dy - M * fh} L200,${baseY - M * fh} L130,${baseY - dy - M * fh} Z`}
              fill="none"
              stroke="var(--color-accent)"
              strokeDasharray="3 3"
              strokeWidth={0.8}
            />
            <line
              x1={60}
              y1={baseY - F * fh}
              x2={60}
              y2={baseY - M * fh}
              stroke="var(--color-accent)"
              strokeDasharray="3 3"
              strokeWidth={0.8}
            />
            <line
              x1={200}
              y1={baseY - F * fh}
              x2={200}
              y2={baseY - M * fh}
              stroke="var(--color-accent)"
              strokeDasharray="3 3"
              strokeWidth={0.8}
            />
            <line
              x1={130}
              y1={baseY + dy - F * fh}
              x2={130}
              y2={baseY + dy - M * fh}
              stroke="var(--color-accent)"
              strokeDasharray="3 3"
              strokeWidth={0.8}
            />
            <text
              x={204}
              y={baseY - M * fh + 4}
              fontSize={6.5}
              fontFamily="var(--font-mono)"
              fill="var(--color-accent)"
              letterSpacing="0.1em"
            >
              MAX {M}
            </text>
          </g>
        ) : null}
        {/* floors */}
        {Array.from({ length: F }).map((_, i) => {
          const y = baseY - i * fh;
          const hot = stage === "transformation" && i === F - 1;
          return (
            <g key={i} className="anim-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <path
                d={front(y)}
                fill={hot ? "var(--viz-parcel-active)" : "var(--viz-fill-soft)"}
                stroke={stroke}
                strokeWidth={0.9}
              />
              <path
                d={side(y)}
                fill={hot ? "var(--viz-parcel-active)" : "var(--viz-parcel)"}
                stroke={stroke}
                strokeWidth={0.9}
              />
              {i === F - 1 ? (
                <path
                  d={top(y)}
                  fill={accent ? "var(--color-accent-soft)" : "var(--viz-parcel)"}
                  stroke={stroke}
                  strokeWidth={0.9}
                />
              ) : null}
            </g>
          );
        })}
        {/* units as ticks on the front face */}
        {Array.from({ length: Math.max(1, Math.min(6, U)) }).map((_, i) => {
          const x = 70 + i * 9;
          return (
            <line
              key={i}
              x1={x}
              y1={baseY - 4 + (x - 60) * (dy / dx)}
              x2={x}
              y2={baseY - fh + 6 + (x - 60) * (dy / dx)}
              stroke={stroke}
              strokeWidth={0.6}
              opacity={0.7}
            />
          );
        })}
        {/* dimension line for floors */}
        <line x1={44} y1={baseY} x2={44} y2={baseY - F * fh} stroke="var(--viz-axis)" strokeWidth={0.6} />
        <line x1={41} y1={baseY} x2={47} y2={baseY} stroke="var(--viz-axis)" strokeWidth={0.6} />
        <line
          x1={41}
          y1={baseY - F * fh}
          x2={47}
          y2={baseY - F * fh}
          stroke="var(--viz-axis)"
          strokeWidth={0.6}
        />
        <text
          x={38}
          y={baseY - (F * fh) / 2 + 2}
          fontSize={6.5}
          textAnchor="end"
          fontFamily="var(--font-mono)"
          fill="var(--color-text-muted)"
          letterSpacing="0.1em"
        >
          {F} PL
        </text>
      </svg>
      <figcaption className="kicker absolute left-0 bottom-0">
        {stage === "current" ? "Estado actual" : stage === "transformation" ? "Transformación" : "Futuro"} ·
        representación conceptual
      </figcaption>
    </figure>
  );
}
