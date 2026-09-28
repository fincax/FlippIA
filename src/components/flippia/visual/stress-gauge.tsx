import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

/**
 * StressGauge — RISK MODE, at a glance.
 *
 * Survival rate as a ring, capital at risk as the number that matters.
 * Both come from the Stress Engine report; nothing is recomputed.
 */
export function StressGauge({
  survivalRate,
  capitalAtRisk,
  marginOfSafety,
  className,
}: {
  survivalRate: number;
  capitalAtRisk: number;
  marginOfSafety: number | null;
  className?: string;
}) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, survivalRate));
  const tone = v >= 0.7 ? "var(--color-verified)" : v >= 0.4 ? "var(--color-warning)" : "var(--color-danger)";
  return (
    <div className={cn("flex items-center gap-5", className)}>
      <svg
        viewBox="0 0 110 110"
        width={110}
        height={110}
        role="img"
        aria-label={`Sobrevive al ${Math.round(v * 100)} % de los escenarios`}
      >
        <circle cx={55} cy={55} r={r} fill="none" stroke="var(--color-border)" strokeWidth={6} />
        <circle
          cx={55}
          cy={55}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={6}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          strokeLinecap="butt"
          transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dashoffset var(--motion-slow) var(--ease-out)" }}
        />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={55 + Math.cos(a) * (r - 9)}
              y1={55 + Math.sin(a) * (r - 9)}
              x2={55 + Math.cos(a) * (r - 6)}
              y2={55 + Math.sin(a) * (r - 6)}
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />
          );
        })}
        <text
          x={55}
          y={53}
          textAnchor="middle"
          fontSize={20}
          fontFamily="var(--font-display)"
          fontWeight={500}
          fill="var(--color-text-primary)"
        >
          {Math.round(v * 100)}
        </text>
        <text
          x={55}
          y={66}
          textAnchor="middle"
          fontSize={6.5}
          fontFamily="var(--font-mono)"
          letterSpacing="0.14em"
          fill="var(--color-text-muted)"
        >
          % SOBREVIVE
        </text>
      </svg>
      <dl className="space-y-3">
        <div>
          <dt className="kicker">Capital en riesgo</dt>
          <dd className="font-display text-2xl num text-danger mt-0.5">{formatMoney(capitalAtRisk)}</dd>
        </div>
        <div>
          <dt className="kicker">Margen de seguridad</dt>
          <dd className="num text-fg mt-0.5">
            {marginOfSafety === null ? "n/d" : `${Math.round(marginOfSafety * 1000) / 10} %`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
