import Link from "next/link";
import { Badge, Money, Pct, Surface } from "@/components/ds";
import { cn } from "@/lib/cn";
import type { StrategyResult } from "@/modules/analysis/types";

export function StrategyCard({
  dealId,
  strategy,
  index,
  compact,
}: {
  dealId: string;
  strategy: StrategyResult;
  index: number;
  compact?: boolean;
}) {
  const s = strategy;
  return (
    <Link href={`/app/deals/${dealId}/strategies#${s.id}`} className="block group h-full">
      <Surface
        className={cn(
          "p-4 h-full transition-colors group-hover:bg-surface-hover",
          index === 0 && "border-accent/40",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="text-[11px] num text-accent">{String(index + 1).padStart(2, "0")}</div>
          <div className="flex gap-1">
            {s.applicability.conditional ? (
              <Badge tone="warning" title="Condicionado a validación">
                *
              </Badge>
            ) : null}
            <Badge>{s.score}</Badge>
          </div>
        </div>
        <div className="font-display text-lg mt-1 uppercase tracking-tight leading-tight">{s.label}</div>
        {!compact ? <p className="text-[12px] text-fg-2 mt-1">{s.description}</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <div>
            <div className="text-fg-3">{s.exitKind === "sale" ? "Beneficio" : "Renta/mes"}</div>
            <div className="font-display text-base">
              <Money value={s.exitKind === "sale" ? s.headline.netProfit : s.headline.monthlyRent} />
            </div>
          </div>
          <div>
            <div className="text-fg-3">{s.exitKind === "sale" ? "ROE" : "TIR"}</div>
            <div className="font-display text-base">
              <Pct value={s.exitKind === "sale" ? s.headline.roe : s.headline.irr} />
            </div>
          </div>
          <div>
            <div className="text-fg-3">Capital</div>
            <div className="num">
              <Money value={s.headline.equityRequired} />
            </div>
          </div>
          <div>
            <div className="text-fg-3">Plazo</div>
            <div className="num">{s.headline.durationMonths} m</div>
          </div>
        </div>
        {s.applicability.conditional ? (
          <div className="mt-2 text-[11px] text-warning">
            Condicionado a {s.applicability.requiredChecks.length} comprobaciones
          </div>
        ) : null}
      </Surface>
    </Link>
  );
}
