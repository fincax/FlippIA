import Link from "next/link";
import { Empty } from "@/components/ds";
import { DealCard } from "@/components/flippia/deal-card";
import { labelDealStatus } from "@/lib/labels";
import { tenantContext } from "@/server/auth/current";
import { listDeals } from "@/server/services/deals";

export const dynamic = "force-dynamic";

/** Cartera — the dossier shelf. Same list, same order; only the presentation. */
export default async function DealsPage() {
  const { ctx } = await tenantContext();
  const deals = await listDeals(ctx, 100);
  const byStatus = new Map<string, number>();
  for (const d of deals) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">Cartera</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1">
            {deals.length ? `${deals.length} ${deals.length === 1 ? "deal" : "deals"}` : "Deals"}
          </h1>
        </div>
        {byStatus.size ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 kicker" aria-label="Deals por estado">
            {[...byStatus.entries()].map(([status, n]) => (
              <li key={status}>
                <span className="num text-fg">{n}</span> {labelDealStatus(status).toLowerCase()}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {deals.length ? (
        <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {deals.map((d, i) => (
            <DealCard
              key={d.id}
              index={i}
              deal={{
                id: d.id,
                title: d.title,
                status: d.status,
                askingPrice: d.askingPrice,
                summary: d.summary,
                updatedAt: d.updatedAt.toISOString(),
                demo: d.demo,
              }}
            />
          ))}
        </div>
      ) : (
        <Empty
          title="Todavía no hay deals."
          body="Escribe una dirección o una referencia catastral y LIA construirá el primero."
          action={
            <Link
              href="/"
              className="rounded-[var(--radius-md)] bg-accent text-accent-ink px-4 py-2 text-sm font-medium"
            >
              Analizar un inmueble
            </Link>
          }
        />
      )}
    </div>
  );
}
