import Link from "next/link";
import { Badge, DemoBadge, Money, Pct, Surface } from "@/components/ds";
import { formatRelative } from "@/lib/format";
import { labelDealStatus, labelRisk } from "@/lib/labels";

export interface DealCardData {
  id: string;
  title: string;
  status: string;
  askingPrice: number | null;
  summary: Record<string, unknown>;
  updatedAt: string;
  demo: boolean;
}

export function DealCard({ deal }: { deal: DealCardData }) {
  const s = deal.summary as {
    topStrategy?: string;
    netProfit?: number | null;
    roe?: number | null;
    dna?: number;
    risk?: string;
    strategies?: number;
    demo?: boolean;
  };
  return (
    <Link href={`/app/deals/${deal.id}`} className="block group">
      <Surface className="p-4 h-full transition-colors group-hover:bg-surface-hover">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm text-fg truncate">{deal.title}</div>
            <div className="text-[12px] text-fg-3 mt-0.5">
              {labelDealStatus(deal.status)} · {formatRelative(deal.updatedAt)}
            </div>
          </div>
          {s.demo || deal.demo ? <DemoBadge /> : null}
        </div>
        {s.topStrategy ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-fg-3">Beneficio</div>
              <div className="font-display text-lg">
                <Money value={s.netProfit ?? null} />
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-fg-3">ROE</div>
              <div className="font-display text-lg">
                <Pct value={s.roe ?? null} />
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-fg-3">DNA</div>
              <div className="font-display text-lg num">{s.dna ?? "–"}</div>
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {s.topStrategy ? <Badge tone="accent">{s.topStrategy}</Badge> : null}
          {s.strategies ? <Badge>{s.strategies} futuros</Badge> : null}
          {s.risk ? (
            <Badge tone={s.risk === "high" ? "danger" : s.risk === "medium" ? "warning" : "success"}>
              riesgo {labelRisk(s.risk)}
            </Badge>
          ) : null}
        </div>
      </Surface>
    </Link>
  );
}
