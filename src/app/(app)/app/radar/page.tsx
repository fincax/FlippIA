import Link from "next/link";
import { Badge, Empty, Money, Pct, SectionTitle, Surface } from "@/components/ds";
import { MicrozoneMap } from "@/components/flippia/microzone-map";
import { WatchButton } from "@/components/flippia/watch-button";
import { formatMoney } from "@/lib/format";
import { parseIntake } from "@/modules/property/intake";
import { autopsy } from "@/modules/watch/rules";
import { tenantContext } from "@/server/auth/current";
import { getInvestorDNA } from "@/server/services/investor";
import { runRadar } from "@/server/services/radar";

export const dynamic = "force-dynamic";

type Hit = Awaited<ReturnType<typeof runRadar>>[number];

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; listing?: string; all?: string }>;
}) {
  const { q, listing: focusId, all } = await searchParams;
  const { ctx } = await tenantContext();
  const { dna: saved, completed } = await getInvestorDNA(ctx);
  // Reverse investing: a spoken objective overrides the saved DNA for this search.
  let dna = saved;
  let objective: string | null = null;
  if (q) {
    const inv = parseIntake(q).investor ?? {};
    dna = {
      ...saved,
      capitalAvailable: inv.capital ?? saved.capitalAvailable,
      maxEquityPerDeal:
        inv.maxEquity ?? (inv.capital ? Math.round(inv.capital * 0.4) : saved.maxEquityPerDeal),
      horizonMonths: inv.horizonMonths ?? saved.horizonMonths,
      targetProfit: inv.targetProfit ?? saved.targetProfit,
      targetRoe: inv.targetRoe ?? saved.targetRoe,
      ticketMax: inv.capital ? Math.max(saved.ticketMax, inv.capital * 1.6) : saved.ticketMax,
    };
    objective = q;
  }
  const hits = await runRadar(ctx, dna, { includeNonMatching: true });
  const matching = hits.filter((h) => h.underwriting.meetsCriteria);
  const others = hits.filter((h) => !h.underwriting.meetsCriteria);
  const focus = focusId ? hits.find((h) => h.listing.id === focusId) : undefined;
  const realCount = hits.filter((h) => !h.listing.demo).length;
  const demoCount = hits.length - realCount;
  const sourceNames = [
    ...new Set(hits.filter((h) => !h.listing.demo).map((h) => h.listing.sourceName ?? h.listing.sourceId)),
  ];
  const focusAutopsy = focus ? autopsy(focus.listing, dna) : null;
  return (
    <div className="space-y-8">
      <div>
        <SectionTitle
          kicker="Radar FlippIA"
          right={
            <Link href="/app/onboarding" className="text-sm text-fg-2 hover:text-fg">
              Ajustar Investor DNA →
            </Link>
          }
        >
          Discrepancias de valor, no pisos baratos
        </SectionTitle>
        <p className="text-sm text-fg-2 max-w-3xl">
          {objective ? <>Objetivo: «{objective}». </> : null}
          Criterios: capital {formatMoney(dna.capitalAvailable)}, aportación máxima{" "}
          {formatMoney(dna.maxEquityPerDeal)}, horizonte {dna.horizonMonths} meses, beneficio ≥{" "}
          {formatMoney(dna.targetProfit)}, ROE ≥ {Math.round(dna.targetRoe * 100)} %. {matching.length} de{" "}
          {hits.length} activos cumplen.{!completed ? " Completa tu Investor DNA para afinar." : ""}
        </p>
      </div>
      {focus && focusAutopsy ? (
        <Surface raised className="p-5 border-accent/40">
          <SectionTitle kicker="Autopsia de la oportunidad">{focus.listing.title}</SectionTitle>
          <div className="text-sm">
            <div className="text-fg">{focusAutopsy.headline}</div>
            {focusAutopsy.reasons.length ? (
              <ul className="mt-2 list-disc pl-4 text-fg-2">
                {focusAutopsy.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-accent">{focusAutopsy.suggestion}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <WatchButton
              listingId={focus.listing.id}
              label={focus.listing.title}
              price={focus.listing.askingPrice}
            />
            <Link
              href={`/app/analyze?q=${encodeURIComponent(analyzeText(focus))}`}
              className="rounded-[var(--radius-md)] border border-line px-3 py-2 text-sm"
            >
              Construir el caso
            </Link>
          </div>
        </Surface>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {matching.length ? (
            matching.map((h) => <HitCard key={h.listing.id} hit={h} />)
          ) : (
            <Empty
              title="Todavía no hay activos que cumplan tus criterios."
              body="Dime cuánto quieres invertir y qué buscas, o relaja beneficio y plazo. Abajo tienes los que casi cumplen, con su autopsia."
            />
          )}
          {all === "1" || matching.length < 4 ? (
            <>
              <div className="text-[11px] uppercase tracking-[0.18em] text-fg-3 pt-4">
                No cumplen (todavía)
              </div>
              {others.slice(0, 8).map((h) => (
                <HitCard key={h.listing.id} hit={h} />
              ))}
            </>
          ) : (
            <Link href="/app/radar?all=1" className="inline-block text-sm text-fg-2 hover:text-fg">
              Ver también los que no cumplen →
            </Link>
          )}
        </div>
        <Surface className="p-5 h-fit lg:sticky lg:top-6">
          <SectionTitle kicker="Capas">Densidad de oportunidad</SectionTitle>
          <MicrozoneMap
            hits={matching.map((h) => ({ microzoneId: h.listing.microzoneId ?? "", score: h.score }))}
          />
          <p className="mt-3 text-[11px] text-fg-3">
            Verde: microzonas con oportunidades compatibles.{" "}
            {realCount
              ? `${realCount} anuncios reales de ${sourceNames.join(", ")}`
              : "Listados DEMO de la red FlippIA"}
            {demoCount && realCount ? ` y ${demoCount} DEMO` : ""}. Sin scraping: solo API oficial y feeds
            autorizados.
          </p>
        </Surface>
      </div>
    </div>
  );
}

function analyzeText(h: Hit): string {
  const l = h.listing;
  return `Analiza ${l.address}, ${l.builtAreaM2} m2${l.bedrooms ? `, ${l.bedrooms} habitaciones` : ""}${l.condition === "to_renovate" ? ", para reformar" : ""} por ${l.askingPrice} €`;
}

function HitCard({ hit }: { hit: Hit }) {
  const u = hit.underwriting;
  return (
    <Surface className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-fg">
            {hit.listing.title}{" "}
            {hit.listing.demo ? (
              <Badge tone="warning" className="ml-1">
                DEMO
              </Badge>
            ) : u.referenceBasis === "demo" ? (
              <Badge
                tone="warning"
                className="ml-1"
                title="Anuncio real valorado contra la tabla DEMO de la microzona: aún hay pocos anuncios reales en la zona."
              >
                Referencia DEMO
              </Badge>
            ) : null}
          </div>
          <div className="text-[12px] text-fg-3">
            {hit.listing.address} · {hit.listing.builtAreaM2} m² · {labelCondition(hit.listing.condition)} ·{" "}
            {hit.listing.sourceName ?? hit.listing.sourceId}
            {hit.listing.reference ? ` · ref. ${hit.listing.reference}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-xl num">{formatMoney(hit.listing.askingPrice)}</div>
          <div className="text-[11px] text-fg-3">
            {u.discountVsAsIs > 0 ? `${Math.round(u.discountVsAsIs * 100)} % bajo as-is` : "sobre as-is"}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px]">
        <div>
          <div className="text-fg-3">Beneficio rápido</div>
          <Money value={u.netProfit} />
        </div>
        <div>
          <div className="text-fg-3">ROE</div>
          <Pct value={u.roe} />
        </div>
        <div>
          <div className="text-fg-3">Capital</div>
          <Money value={u.equityRequired} />
        </div>
        <div>
          <div className="text-fg-3">Plazo</div>
          <span className="num">{u.durationMonths} m</span>
        </div>
        <div>
          <div className="text-fg-3">Diferencial</div>
          <Money value={u.opportunityGap} />
        </div>
      </div>
      {hit.why.length ? (
        <ul className="mt-2 text-[12px] text-fg-2 list-disc pl-4">
          {hit.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {!u.meetsCriteria ? (
        <p className="mt-2 text-[12px] text-warning">
          No cumple: {u.failedCriteria.join(" · ")}. Volvería a cumplir por debajo de{" "}
          {formatMoney(u.reentryPrice)}.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/app/analyze?q=${encodeURIComponent(analyzeText(hit))}`}
          className="rounded-[var(--radius-md)] bg-fg text-bg px-3 py-1.5 text-[13px] font-medium"
        >
          Construir el caso
        </Link>
        <Link
          href={`/app/radar?listing=${hit.listing.id}`}
          className="rounded-[var(--radius-md)] border border-line px-3 py-1.5 text-[13px] text-fg-2 hover:text-fg"
        >
          Autopsia
        </Link>
        <WatchButton listingId={hit.listing.id} label={hit.listing.title} price={hit.listing.askingPrice} />
        {hit.listing.url ? (
          <a
            href={hit.listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[var(--radius-md)] border border-line px-3 py-1.5 text-[13px] text-fg-2 hover:text-fg"
          >
            Ver anuncio ↗
          </a>
        ) : null}
      </div>
    </Surface>
  );
}

function labelCondition(c: Hit["listing"]["condition"]): string {
  return c === "to_renovate"
    ? "para reformar"
    : c === "renovated"
      ? "reformado"
      : c === "good"
        ? "buen estado"
        : "estado no indicado";
}
