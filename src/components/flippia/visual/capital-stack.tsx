import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";
import type { CapitalStack } from "@/modules/analysis/types";

/**
 * CapitalStackVisual — the capital structure as a section, not a list.
 *
 * Instruments sized as a ratio are drawn at that ratio (LTV over purchase
 * price, LTC over total cost); instruments sized as an amount are drawn over
 * the reference the page passes. The remaining share is equity. Nothing is
 * recomputed: the widths are the sizing the finance module already returned.
 */
export function CapitalStackVisual({
  stacks,
  recommendedId,
  reference,
  className,
}: {
  stacks: CapitalStack[];
  recommendedId: string;
  /** Purchase price and total cost of the base scenario, for amount → share. */
  reference?: { purchasePrice?: number | null; totalCost?: number | null };
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)}>
      {stacks.map((s) => {
        const recommended = s.id === recommendedId;
        const shares = s.instruments.map((i) => {
          const base = i.sizing.type === "ltv" ? reference?.purchasePrice : reference?.totalCost;
          const ratio = i.sizing.type === "amount" ? (base ? i.sizing.amount / base : null) : i.sizing.ratio;
          return { instrument: i, ratio: ratio === null ? null : Math.max(0, Math.min(1, ratio)) };
        });
        const known = shares.every((x) => x.ratio !== null);
        const debt = known ? shares.reduce((a, x) => a + (x.ratio ?? 0), 0) : 0;
        const equity = Math.max(0, 1 - debt);
        return (
          <div
            key={s.id}
            className={cn(
              "frame border p-4 md:p-5 bg-surface",
              recommended ? "border-accent/60" : "border-line",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="kicker">{recommended ? "Estructura recomendada" : "Estructura"}</div>
                <div className="font-display text-lg text-fg mt-1">{s.label}</div>
              </div>
              {known ? (
                <div className="text-right">
                  <div className="kicker">Equity</div>
                  <div className="font-display text-lg num">{formatPercent(equity, { decimals: 0 })}</div>
                </div>
              ) : null}
            </div>
            <p className="text-[12px] text-fg-2 mt-1">{s.description}</p>

            {/* the section */}
            <div className="mt-4 flex h-10 w-full border border-line-strong overflow-hidden" aria-hidden>
              {known
                ? shares.map((x, i) => (
                    <div
                      key={x.instrument.label}
                      className="h-full border-r border-bg"
                      title={x.instrument.label}
                      style={{
                        width: `${(x.ratio ?? 0) * 100}%`,
                        background: `color-mix(in srgb, var(--color-inferred) ${80 - i * 22}%, var(--color-surface-raised))`,
                      }}
                    />
                  ))
                : null}
              <div
                className="h-full flex-1"
                style={{
                  background:
                    "repeating-linear-gradient(135deg, var(--color-accent-soft) 0 6px, transparent 6px 12px)",
                }}
              />
            </div>

            <ul className="mt-3 space-y-1.5 text-[12px]">
              {shares.map((x, i) => (
                <li
                  key={x.instrument.label}
                  className="grid grid-cols-[10px_minmax(0,1fr)_auto] gap-2 items-baseline"
                >
                  <span
                    aria-hidden
                    className="inline-block size-2 translate-y-px"
                    style={{
                      background: `color-mix(in srgb, var(--color-inferred) ${80 - i * 22}%, var(--color-surface-raised))`,
                    }}
                  />
                  <span className="text-fg min-w-0">
                    {x.instrument.label}
                    <span className="text-fg-3">
                      {" "}
                      · {formatPercent(x.instrument.annualRate)} ·{" "}
                      {x.instrument.interestOnly ? "solo intereses" : `${x.instrument.termMonths} meses`}
                      {x.instrument.profitShare
                        ? ` · ${Math.round(x.instrument.profitShare * 100)} % del beneficio`
                        : ""}
                    </span>
                  </span>
                  <span className="num text-fg-2 shrink-0">
                    {x.instrument.sizing.type === "amount"
                      ? formatMoney(x.instrument.sizing.amount)
                      : `${Math.round(x.instrument.sizing.ratio * 100)} % ${x.instrument.sizing.type.toUpperCase()}`}
                  </span>
                </li>
              ))}
              <li className="grid grid-cols-[10px_minmax(0,1fr)_auto] gap-2 items-baseline">
                <span
                  aria-hidden
                  className="inline-block size-2 translate-y-px"
                  style={{
                    background:
                      "repeating-linear-gradient(135deg, var(--color-accent) 0 2px, transparent 2px 4px)",
                  }}
                />
                <span className="text-fg">Capital propio</span>
                <span className="num text-fg-2">
                  {known ? formatPercent(equity, { decimals: 0 }) : "resto"}
                </span>
              </li>
            </ul>
          </div>
        );
      })}
    </div>
  );
}
