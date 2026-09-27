import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

/**
 * PriceSparkline — the listing's price history as one line.
 * Draws the `priceHistory` the source adapter already returns; nothing is
 * computed beyond scaling to the box.
 */
export function PriceSparkline({
  history,
  className,
}: {
  history: Array<{ date: string; price: number }>;
  className?: string;
}) {
  if (history.length < 2) return null;
  const w = 120;
  const h = 28;
  const pad = 2;
  const prices = history.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const sx = (i: number) => pad + (i / (history.length - 1)) * (w - pad * 2);
  const sy = (v: number) => pad + (1 - (v - min) / Math.max(1, max - min)) * (h - pad * 2);
  const d = history
    .map((p, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(p.price).toFixed(1)}`)
    .join(" ");
  const first = history[0]!.price;
  const last = history[history.length - 1]!.price;
  const down = last < first;
  const tone = down ? "var(--color-verified)" : last > first ? "var(--color-danger)" : "var(--viz-axis)";
  return (
    <figure className={cn("flex items-center gap-3", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={`Histórico de precio: ${formatMoney(first)} → ${formatMoney(last)}`}
      >
        <path d={d} fill="none" stroke={tone} strokeWidth={1.2} strokeLinejoin="round" />
        {history.map((p, i) => (
          <circle
            key={p.date}
            cx={sx(i)}
            cy={sy(p.price)}
            r={i === history.length - 1 ? 2 : 1.2}
            fill={tone}
          />
        ))}
      </svg>
      <figcaption className="kicker">
        {history.length} {history.length === 1 ? "precio" : "precios"} ·{" "}
        <span style={{ color: tone }} className="num">
          {formatMoney(last - first, { signed: true })}
        </span>
      </figcaption>
    </figure>
  );
}
