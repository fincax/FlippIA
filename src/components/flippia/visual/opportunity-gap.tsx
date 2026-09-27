import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

/**
 * OpportunityGapVisual — TODAY ──── POTENTIAL ────> POSSIBLE FUTURE.
 *
 * Every number comes from `analysis.gap` (deterministic engine). The component
 * draws; it never recomputes. Levers are stacked in proportion to their amount.
 */
export function OpportunityGapVisual({
  currentValue,
  potentialValue,
  gap,
  levers,
  className,
}: {
  currentValue: number;
  potentialValue: number;
  gap: number;
  levers: Array<{ key: string; label: string; amount: number; explanation: string }>;
  className?: string;
}) {
  const max = Math.max(1, currentValue, potentialValue);
  const todayW = Math.min(100, Math.max(2, (currentValue / max) * 100));
  const positive = levers.filter((l) => l.amount > 0);
  const totalPos = positive.reduce((a, l) => a + l.amount, 0) || 1;
  return (
    <div className={cn("space-y-5", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
        <div>
          <div className="kicker">Hoy</div>
          <div className="font-display text-2xl md:text-3xl num mt-1">{formatMoney(currentValue)}</div>
        </div>
        <div className="text-center pb-1">
          <div className="kicker text-accent">Potencial</div>
          <div className="font-display text-3xl md:text-5xl num text-accent leading-none mt-1">
            {formatMoney(gap, { signed: true })}
          </div>
        </div>
        <div className="text-right">
          <div className="kicker">Futuro posible</div>
          <div className="font-display text-2xl md:text-3xl num mt-1">{formatMoney(potentialValue)}</div>
        </div>
      </div>

      {/* the bar: today, then the gap as an arrow of stacked levers */}
      <div className="relative">
        <div className="h-8 w-full border border-line bg-bg-2 relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-surface-hover border-r border-line-strong"
            style={{ width: `${todayW}%` }}
          />
          <div className="absolute inset-y-0 flex" style={{ left: `${todayW}%`, right: 0 }}>
            {positive.map((l, i) => (
              <div
                key={l.key}
                title={`${l.label}: ${formatMoney(l.amount, { signed: true })}`}
                className="h-full border-r border-bg anim-reveal"
                style={{
                  width: `${(l.amount / totalPos) * 100}%`,
                  background: `color-mix(in srgb, var(--color-accent) ${88 - i * 16}%, transparent)`,
                  animationDelay: `${200 + i * 140}ms`,
                }}
              />
            ))}
          </div>
          <span
            aria-hidden
            className="absolute right-1 top-1/2 -translate-y-1/2 text-accent-ink text-[11px] font-mono"
          >
            →
          </span>
        </div>
        <div className="mt-1 flex justify-between kicker">
          <span>Valor actual</span>
          <span className="text-accent">Diferencial de oportunidad</span>
        </div>
      </div>

      <ol className="space-y-1.5">
        {levers.map((l, i) => (
          <li
            key={l.key}
            className="grid grid-cols-[24px_minmax(0,1fr)_auto] gap-3 items-baseline text-[13px]"
          >
            <span className="kicker num">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-fg-2 min-w-0">
              <span className="text-fg">{l.label}</span> — {l.explanation}
            </span>
            <span className={cn("num shrink-0", l.amount < 0 ? "text-danger" : "text-fg")}>
              {formatMoney(l.amount, { signed: true })}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
