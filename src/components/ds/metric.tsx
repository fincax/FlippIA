import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";
import type { MetricValue } from "@/modules/engines/financial";

export function formatMetricValue(m: { value: number | null; unit: MetricValue["unit"] }): string {
  if (m.value === null || m.value === undefined) return "n/d";
  switch (m.unit) {
    case "currency":
      return formatMoney(m.value);
    case "ratio":
      return formatPercent(m.value);
    case "months":
      return `${m.value} m`;
    default:
      return m.value.toFixed(2);
  }
}

/** FinancialMetric: value + label + formula on demand. */
export function FinancialMetric({
  label,
  metric,
  tone,
  size = "md",
  className,
  hint,
}: {
  label: string;
  metric: { value: number | null; unit: MetricValue["unit"]; formula?: string; explanation?: string };
  tone?: "auto" | "neutral";
  size?: "sm" | "md" | "lg";
  className?: string;
  hint?: string;
}) {
  const v = metric.value;
  const color = tone === "neutral" || v === null ? "text-fg" : v < 0 ? "text-danger" : "text-fg";
  const sizes = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" };
  return (
    <div
      className={cn("min-w-0", className)}
      title={
        metric.formula
          ? `${metric.formula}${metric.explanation ? ` — ${metric.explanation}` : ""}`
          : undefined
      }
    >
      <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3 truncate">{label}</div>
      <div className={cn("num font-display leading-tight mt-0.5", sizes[size], color)}>
        {formatMetricValue(metric)}
      </div>
      {hint ? <div className="text-[11px] text-fg-3 mt-0.5 truncate">{hint}</div> : null}
    </div>
  );
}

export function Money({
  value,
  signed,
  className,
}: {
  value: number | null | undefined;
  signed?: boolean;
  className?: string;
}) {
  if (value === null || value === undefined) return <span className={cn("num", className)}>n/d</span>;
  return (
    <span className={cn("num", value < 0 ? "text-danger" : "", className)}>
      {formatMoney(value, { signed })}
    </span>
  );
}

export function Pct({
  value,
  signed,
  decimals,
  className,
}: {
  value: number | null | undefined;
  signed?: boolean;
  decimals?: number;
  className?: string;
}) {
  if (value === null || value === undefined) return <span className={cn("num", className)}>n/d</span>;
  return (
    <span className={cn("num", value < 0 ? "text-danger" : "", className)}>
      {formatPercent(value, { signed, decimals })}
    </span>
  );
}
