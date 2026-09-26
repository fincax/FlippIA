import Link from "next/link";
import { Badge, Kicker, SectionTitle, Surface } from "@/components/ds";
import { FlippIACommand } from "@/components/flippia/command-bar";
import { DealCard } from "@/components/flippia/deal-card";
import { AlertList } from "@/components/flippia/alert-list";
import { tenantContext } from "@/server/auth/current";
import { listAlerts, pulse } from "@/server/services/alerts";
import { listDeals } from "@/server/services/deals";
import { getInvestorDNA } from "@/server/services/investor";
import { runRadar } from "@/server/services/radar";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { ctx, session } = await tenantContext();
  const [p, alerts, deals, dna] = await Promise.all([
    pulse(ctx),
    listAlerts(ctx, 8),
    listDeals(ctx, 6),
    getInvestorDNA(ctx),
  ]);
  const radar = (await runRadar(ctx, dna.dna)).slice(0, 3);
  return (
    <div className="space-y-10">
      <section className="anim-rise">
        <Kicker>FlippIA Pulse</Kicker>
        <h1 className="font-display text-3xl md:text-4xl mt-1">
          {p.greeting} {session.user.name.split(" ")[0]}.
        </h1>
        <ul className="mt-3 space-y-1 text-fg-2">
          {p.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {!dna.completed ? (
          <Link
            href="/app/onboarding"
            className="inline-flex mt-4 items-center gap-2 rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent"
          >
            Completa tu Investor DNA para que LIA filtre por tus criterios →
          </Link>
        ) : null}
      </section>

      <section>
        <SectionTitle kicker="LIA">¿Qué quieres descubrir?</SectionTitle>
        <FlippIACommand size="md" showActions />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section>
          <SectionTitle
            kicker="Now"
            right={alerts.length ? <Badge tone="accent">{p.unreadAlerts} sin leer</Badge> : null}
          >
            Qué necesita mi atención
          </SectionTitle>
          <AlertList
            alerts={alerts.map((a) => ({
              id: a.id,
              title: a.title,
              body: a.body,
              severity: a.severity,
              dealId: a.dealId,
              read: Boolean(a.readAt),
              createdAt: a.createdAt.toISOString(),
              payload: a.payload,
            }))}
          />
        </section>
        <section>
          <SectionTitle
            kicker="Radar"
            right={
              <Link href="/app/radar" className="text-sm text-fg-2 hover:text-fg">
                Ver radar →
              </Link>
            }
          >
            Qué se ha descubierto
          </SectionTitle>
          {radar.length ? (
            <div className="space-y-3">
              {radar.map((h) => (
                <Surface key={h.listing.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-fg truncate">{h.listing.title}</div>
                      <div className="text-[12px] text-fg-3 truncate">{h.listing.address}</div>
                    </div>
                    <Badge tone="accent">{h.score}</Badge>
                  </div>
                  <p className="mt-2 text-[12px] text-fg-2">{h.why[0]}</p>
                  <Link
                    href={`/app/analyze?q=${encodeURIComponent(`Analiza ${h.listing.address}, ${h.listing.builtAreaM2} m2 por ${h.listing.askingPrice} €`)}`}
                    className="mt-2 inline-block text-[12px] text-accent"
                  >
                    Construir el caso →
                  </Link>
                </Surface>
              ))}
            </div>
          ) : (
            <Surface className="p-6 text-sm text-fg-2">
              Todavía no hay oportunidades compatibles con tu Investor DNA. Ajusta tus criterios o dime cuánto
              quieres invertir.
            </Surface>
          )}
        </section>
      </div>

      <section>
        <SectionTitle
          kicker="Portfolio"
          right={
            <Link href="/app/deals" className="text-sm text-fg-2 hover:text-fg">
              Todos los deals →
            </Link>
          }
        >
          Qué tengo activo
        </SectionTitle>
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
          <Surface className="p-6 text-sm text-fg-2">
            Aún no tienes deals. Escribe una dirección arriba y LIA construirá el primero.
          </Surface>
        )}
      </section>
    </div>
  );
}
