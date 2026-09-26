import Link from "next/link";
import { Empty, SectionTitle } from "@/components/ds";
import { DealCard } from "@/components/flippia/deal-card";
import { tenantContext } from "@/server/auth/current";
import { listDeals } from "@/server/services/deals";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const { ctx } = await tenantContext();
  const deals = await listDeals(ctx, 100);
  return (
    <div>
      <SectionTitle kicker="Portfolio">Deals</SectionTitle>
      {deals.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {deals.map((d) => (
            <DealCard
              key={d.id}
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
              className="rounded-[var(--radius-md)] bg-accent text-bg px-4 py-2 text-sm font-medium"
            >
              Analizar un inmueble
            </Link>
          }
        />
      )}
    </div>
  );
}
