import { cn } from "@/lib/cn";

/** Horizontal bar list: answers "where is the margin / cost created?" */
export function BarList({
  items,
  max,
  className,
  format,
}: {
  items: Array<{ label: string; value: number; tone?: "accent" | "neutral" | "danger" | "success" }>;
  max?: number;
  className?: string;
  format: (v: number) => string;
}) {
  const m = max ?? Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className={cn("space-y-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
          <div className="min-w-0">
            <div className="flex justify-between text-[12px] mb-1">
              <span className="text-fg-2 truncate">{i.label}</span>
              <span className="num text-fg ml-2 shrink-0">{format(i.value)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  i.tone === "danger"
                    ? "bg-danger"
                    : i.tone === "success"
                      ? "bg-success"
                      : i.tone === "accent"
                        ? "bg-accent"
                        : "bg-fg-3",
                )}
                style={{ width: `${Math.min(100, (Math.abs(i.value) / m) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Cumulative cash curve — answers "when is capital at risk and when does it come back?" */
export function CashCurve({
  points,
  className,
  height = 120,
}: {
  points: Array<{ month: number; cumulative: number }>;
  className?: string;
  height?: number;
}) {
  if (points.length < 2) return null;
  const w = 320;
  const h = height;
  const pad = 8;
  const xs = points.map((p) => p.month);
  const ys = points.map((p) => p.cumulative);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const sx = (x: number) => pad + ((x - minX) / Math.max(1, maxX - minX)) * (w - pad * 2);
  const sy = (y: number) => pad + (1 - (y - minY) / Math.max(1, maxY - minY)) * (h - pad * 2);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.month).toFixed(1)},${sy(p.cumulative).toFixed(1)}`)
    .join(" ");
  const zero = sy(0);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("w-full h-auto", className)}
      role="img"
      aria-label="Curva de caja acumulada"
    >
      <line
        x1={pad}
        x2={w - pad}
        y1={zero}
        y2={zero}
        stroke="var(--color-border-strong)"
        strokeDasharray="3 3"
      />
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.month} cx={sx(p.month)} cy={sy(p.cumulative)} r={1.8} fill="var(--color-accent)" />
      ))}
    </svg>
  );
}

/** Radial DNA: nine dimensions, one glance. */
export function RadialDNA({
  dimensions,
  size = 220,
  className,
}: {
  dimensions: Array<{ key: string; label: string; score: number }>;
  size?: number;
  className?: string;
}) {
  const c = size / 2;
  const r = size / 2 - 40;
  const n = dimensions.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const;
  };
  const poly = dimensions.map((d, i) => pt(i, d.score / 100).join(",")).join(" ");
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={cn("mx-auto", className)}
      role="img"
      aria-label="Opportunity DNA"
    >
      {[0.25, 0.5, 0.75, 1].map((v) => (
        <polygon
          key={v}
          points={dimensions.map((_, i) => pt(i, v).join(",")).join(" ")}
          fill="none"
          stroke="var(--color-border)"
        />
      ))}
      {dimensions.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--color-border)" />;
      })}
      <polygon points={poly} fill="rgba(230,180,80,0.18)" stroke="var(--color-accent)" strokeWidth={1.5} />
      {dimensions.map((d, i) => {
        const [x, y] = pt(i, 1.22);
        return (
          <text
            key={d.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fill="var(--color-text-secondary)"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

/** Tornado of stress outcomes — answers "which variable threatens the return?" */
export function Tornado({
  items,
  format,
  className,
}: {
  items: Array<{ label: string; delta: number; survives: boolean }>;
  format: (v: number) => string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.delta)));
  return (
    <div className={cn("space-y-1.5", className)}>
      {items.map((i) => (
        <div
          key={i.label}
          className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-2 text-[12px]"
        >
          <span className="text-fg-2 truncate">{i.label}</span>
          <div className="relative h-2 bg-surface-raised rounded-full overflow-hidden">
            <div
              className={cn("absolute top-0 h-full rounded-full", i.survives ? "bg-warning" : "bg-danger")}
              style={{ right: "50%", width: `${(Math.abs(Math.min(0, i.delta)) / max) * 50}%` }}
            />
            <div
              className="absolute top-0 h-full bg-success rounded-full"
              style={{ left: "50%", width: `${(Math.max(0, i.delta) / max) * 50}%` }}
            />
          </div>
          <span className={cn("num w-24 text-right", i.delta < 0 ? "text-danger" : "text-success")}>
            {format(i.delta)}
          </span>
        </div>
      ))}
    </div>
  );
}
