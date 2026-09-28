import Link from "next/link";
import { Badge, DemoBadge, Money, Pct } from "@/components/ds";
import { cn } from "@/lib/cn";
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

const STATUS_TONE: Record<string, string> = {
  draft: "bg-fg-3",
  analyzing: "bg-accent anim-pulse",
  analyzed: "bg-accent",
  watching: "bg-inferred",
  rejected: "bg-fg-3/50",
  approved: "bg-verified",
  acquired: "bg-verified",
  project: "bg-verified",
  closed: "bg-fg-3/50",
};

/** A deal as a dossier tab: status, headline numbers, the future it leads with. */
export function DealCard({ deal, index }: { deal: DealCardData; index?: number }) {
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
    <Link href={`/app/deals/${deal.id}`} className="block group h-full">
      <article className="frame h-full border border-line bg-surface transition-colors group-hover:bg-surface-hover flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <span className="kicker flex items-center gap-2 min-w-0">
            {index !== undefined ? <span className="num">{String(index + 1).padStart(2, "0")}</span> : null}
            <span
              aria-hidden
              className={cn("inline-block size-1.5 rounded-full", STATUS_TONE[deal.status] ?? "bg-fg-3")}
            />
            <span className="truncate">{labelDealStatus(deal.status)}</span>
          </span>
          <span className="kicker num shrink-0">{formatRelative(deal.updatedAt)}</span>
        </div>
        <div className="p-4 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="font-display text-base md:text-lg text-fg leading-tight">{deal.title}</div>
            {s.demo || deal.demo ? <DemoBadge /> : null}
          </div>
          {s.topStrategy ? (
            <>
              <div className="kicker mt-3 text-accent truncate">
                01 · {s.topStrategy}
                {s.strategies ? <span className="text-fg-3"> · {s.strategies} futuros</span> : null}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <dt className="kicker">Beneficio</dt>
                  <dd className="font-display text-lg num">
                    <Money value={s.netProfit ?? null} />
                  </dd>
                </div>
                <div>
                  <dt className="kicker">ROE</dt>
                  <dd className="font-display text-lg num">
                    <Pct value={s.roe ?? null} />
                  </dd>
                </div>
                <div>
                  <dt className="kicker">DNA</dt>
                  <dd className="font-display text-lg num">{s.dna ?? "–"}</dd>
                  {typeof s.dna === "number" ? (
                    <dd className="mt-1 h-1 bg-bg-2 overflow-hidden" aria-hidden>
                      <span
                        className="block h-full bg-accent"
                        style={{ width: `${Math.max(0, Math.min(100, s.dna))}%` }}
                      />
                    </dd>
                  ) : null}
                </div>
              </dl>
            </>
          ) : (
            <p className="text-[12px] text-fg-3 mt-3">Sin análisis todavía.</p>
          )}
        </div>
        <div className="border-t border-line px-4 py-2 flex items-center justify-between gap-3">
          {s.risk ? (
            <>
              <span className="kicker">Riesgo</span>
              <Badge tone={s.risk === "high" ? "danger" : s.risk === "medium" ? "warning" : "success"}>
                {labelRisk(s.risk)}
              </Badge>
            </>
          ) : (
            <span className="kicker">Dossier</span>
          )}
          <span className="kicker text-fg-3 group-hover:text-accent transition-colors ml-auto">abrir →</span>
        </div>
      </article>
    </Link>
  );
}
