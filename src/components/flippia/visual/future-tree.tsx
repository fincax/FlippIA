import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";
import type { StrategyResult } from "@/modules/analysis/types";

/**
 * FutureTree — the asset today branches into the futures FlippIA already
 * computed. Consumes `StrategyResult[]` exactly as the strategy engine returns
 * them. Never hardcodes a count; the tree is as wide as the result.
 *
 *                     FUTURO 01
 *                   ↗
 *   ACTIVO ACTUAL ——  FUTURO 02
 *                   ↘
 *                     FUTURO 03
 */

const FAMILY: Record<StrategyResult["family"], string> = {
  sell: "Vender",
  hold: "Mantener",
  transform: "Transformar",
  develop: "Desarrollar",
};

export function FutureTree({
  origin,
  futures,
  hrefFor,
  className,
}: {
  origin: { label: string; sublabel?: string; value?: number | null };
  futures: StrategyResult[];
  hrefFor: (strategy: StrategyResult) => string;
  className?: string;
}) {
  const n = futures.length;
  const rowH = 100;
  return (
    <div className={cn("grid gap-0 md:grid-cols-[minmax(200px,4fr)_72px_minmax(0,8fr)]", className)}>
      {/* origin */}
      <div className="frame border border-line bg-surface p-5 md:self-center">
        <div className="kicker">Activo actual</div>
        <div className="font-display text-xl md:text-2xl mt-2 text-fg leading-tight">{origin.label}</div>
        {origin.sublabel ? <div className="text-[12px] text-fg-3 mt-1">{origin.sublabel}</div> : null}
        {origin.value !== undefined && origin.value !== null ? (
          <div className="mt-4">
            <div className="kicker">Valor hoy</div>
            <div className="font-display text-2xl num mt-1">{formatMoney(origin.value)}</div>
          </div>
        ) : null}
      </div>

      {/* connectors: an orthogonal schematic — spine, origin stub, one tick per future */}
      <div className="hidden md:block relative anim-rise" style={{ animationDelay: "160ms" }} aria-hidden>
        <span className="absolute left-1/2 inset-y-0 w-px bg-line-strong" />
        <span className="absolute top-1/2 left-0 w-1/2 h-px bg-accent" />
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-1.5 bg-accent" />
      </div>
      <div className="md:hidden h-6 w-px bg-line-strong mx-auto" aria-hidden />

      {/* futures */}
      <ol className="stagger space-y-2" aria-label="Futuros posibles">
        {futures.map((s, i) => (
          <li key={s.id} className="relative" style={{ minHeight: rowH - 8 }}>
            <span
              aria-hidden
              className={cn(
                "hidden md:block absolute right-full top-1/2 w-9 h-px",
                i === 0 ? "bg-accent" : "bg-line-strong",
              )}
            />
            <FutureNode strategy={s} index={i} href={hrefFor(s)} />
          </li>
        ))}
        {!n ? (
          <li className="border border-dashed border-line p-5 text-sm text-fg-2">
            No hay futuros defendibles con los datos disponibles.
          </li>
        ) : null}
      </ol>
    </div>
  );
}

export function FutureNode({
  strategy: s,
  index,
  href,
  selected,
  compact,
}: {
  strategy: StrategyResult;
  index: number;
  href: string;
  selected?: boolean;
  compact?: boolean;
}) {
  const sale = s.exitKind === "sale";
  const survival = s.stress?.survivalRate ?? null;
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group block border bg-surface transition-colors hover:bg-surface-hover focus-visible:outline-2",
        index === 0 || selected ? "border-accent/60" : "border-line",
      )}
    >
      <div className="grid grid-cols-[44px_minmax(0,1fr)] md:grid-cols-[52px_minmax(0,1fr)_auto]">
        <div className="border-r border-line grid place-items-start p-3">
          <span className={cn("kicker num", index === 0 ? "text-accent" : "text-fg-3")}>
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <div className="p-3 md:p-4 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-display text-base md:text-lg uppercase tracking-[0.02em] text-fg leading-tight">
              {s.label}
            </span>
            <span className="kicker">{FAMILY[s.family]}</span>
            {s.applicability.conditional ? (
              <span className="kicker text-warning" title="Condicionada a comprobaciones">
                cond. · {s.applicability.requiredChecks.length}
              </span>
            ) : null}
          </div>
          {!compact ? <p className="text-[12px] text-fg-2 mt-1 line-clamp-2">{s.description}</p> : null}
          <dl className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-x-4 gap-y-2">
            <Cell
              k="Capital"
              v={s.headline.equityRequired !== null ? formatMoney(s.headline.equityRequired) : "n/d"}
            />
            <Cell k="Plazo" v={`${s.headline.durationMonths} m`} />
            <Cell
              k={sale ? "Resultado" : "Renta/mes"}
              v={
                sale
                  ? s.headline.netProfit !== null
                    ? formatMoney(s.headline.netProfit, { signed: true })
                    : "n/d"
                  : s.headline.monthlyRent !== null
                    ? formatMoney(s.headline.monthlyRent)
                    : "n/d"
              }
              strong
            />
            <Cell
              k={sale ? "ROE" : "TIR"}
              v={
                sale
                  ? s.headline.roe !== null
                    ? formatPercent(s.headline.roe)
                    : "n/d"
                  : s.headline.irr !== null
                    ? formatPercent(s.headline.irr)
                    : "n/d"
              }
            />
            <Cell
              k="Riesgo"
              v={survival !== null ? `sobrevive ${Math.round(survival * 100)} %` : "n/d"}
              tone={survival === null ? undefined : survival >= 0.7 ? "ok" : survival >= 0.4 ? "warn" : "bad"}
            />
          </dl>
        </div>
        <div className="hidden md:grid place-items-center border-l border-line px-4 text-right">
          <div>
            <div className="kicker">Score</div>
            <div className="font-display text-xl num text-fg">{s.score}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Cell({
  k,
  v,
  strong,
  tone,
}: {
  k: string;
  v: string;
  strong?: boolean;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className="min-w-0">
      <dt className="kicker truncate">{k}</dt>
      <dd
        className={cn(
          "num mt-0.5 truncate",
          strong ? "font-display text-base text-fg" : "text-[13px] text-fg-2",
          tone === "ok" && "text-verified",
          tone === "warn" && "text-warning",
          tone === "bad" && "text-danger",
        )}
      >
        {v}
      </dd>
    </div>
  );
}
