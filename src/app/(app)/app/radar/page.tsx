import Link from "next/link";
import { Badge, Empty, Money, Pct, SectionTitle, Surface } from "@/components/ds";
import { MicrozoneMap } from "@/components/flippia/microzone-map";
import { WatchButton } from "@/components/flippia/watch-button";
import { formatMoney } from "@/lib/format";
import { applyBriefToDna, parseProjectBrief } from "@/modules/radar/brief";
import type { StrategyQuickResult } from "@/modules/radar/strategies";
import { isStrategyUnderwriting } from "@/modules/radar/strategies";
import { radarStrategySet } from "@/modules/radar/underwrite";
import { STRATEGY_PLUGINS } from "@/modules/strategies/plugins";
import { autopsy } from "@/modules/watch/rules";
import { tenantContext } from "@/server/auth/current";
import { getInvestorDNA } from "@/server/services/investor";
import { runRadar } from "@/server/services/radar";

export const dynamic = "force-dynamic";

type Hit = Awaited<ReturnType<typeof runRadar>>[number];

const strategyLabel = (id: string | null | undefined) =>
  STRATEGY_PLUGINS.find((p) => p.id === id)?.label ?? id ?? "";

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; listing?: string; all?: string }>;
}) {
  const { q, listing: focusId, all } = await searchParams;
  const { ctx } = await tenantContext();
  const { dna: saved, completed } = await getInvestorDNA(ctx);
  // Reverse investing: a spoken objective (budget, zones, price cap, project) overrides the saved DNA for this search.
  const brief = q ? parseProjectBrief(q) : undefined;
  const dna = brief ? applyBriefToDna(saved, brief) : saved;
  const strategySet = radarStrategySet(dna, { brief });
  const hits = await runRadar(ctx, dna, { includeNonMatching: true, brief });
  const matching = hits.filter((h) => h.underwriting.meetsCriteria);
  // Nearly-there first: assets that fit the project, then fewest failed criteria, then score.
  const fits = (h: Hit) => (isStrategyUnderwriting(h.underwriting) ? Number(h.underwriting.projectFit) : 1);
  const others = hits
    .filter((h) => !h.underwriting.meetsCriteria)
    .sort(
      (a, b) =>
        fits(b) - fits(a) ||
        a.underwriting.failedCriteria.length - b.underwriting.failedCriteria.length ||
        b.score - a.score,
    );
  const fitting = strategySet ? hits.filter((h) => fits(h) === 1).length : null;
  const focus = focusId ? hits.find((h) => h.listing.id === focusId) : undefined;
  const focusAutopsy = focus ? autopsy(focus.listing, dna, { brief }) : null;
  const hasOwn = hits.some((h) => !h.listing.demo);
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
          {brief?.hasProject ? "Inmuebles para tu proyecto" : "Discrepancias de valor, no pisos baratos"}
        </SectionTitle>
        <p className="text-sm text-fg-2 max-w-3xl">
          {brief?.hasProject ? <>Proyecto: {brief.summary}. </> : q ? <>Objetivo: «{q}». </> : null}
          Criterios: capital {formatMoney(dna.capitalAvailable)}, aportación máxima{" "}
          {formatMoney(dna.maxEquityPerDeal)}, horizonte {dna.horizonMonths} meses, beneficio ≥{" "}
          {formatMoney(dna.targetProfit)}, ROE ≥ {Math.round(dna.targetRoe * 100)} %
          {brief?.asset.maxPrice ? <>, precio ≤ {formatMoney(brief.asset.maxPrice)}</> : null}.{" "}
          {fitting !== null && brief?.hasProject
            ? `${fitting} de ${hits.length} activos encajan con el proyecto; ${matching.length} cumplen además tus criterios.`
            : `${matching.length} de ${hits.length} activos cumplen.`}
          {!completed ? " Completa tu Investor DNA para afinar." : ""}
        </p>
        {strategySet ? (
          <p className="mt-1 text-[12px] text-fg-3 max-w-3xl">
            Cada activo se evalúa con {strategySet.length === 1 ? "la vía" : `${strategySet.length} vías`}{" "}
            {strategySet.map(strategyLabel).join(", ").toLowerCase()}; se muestra la mejor y el resto en la
            autopsia. Pase rápido con referencias de microzona: el análisis completo lo afina.
          </p>
        ) : null}
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
          {focusAutopsy.strategies?.length ? (
            <StrategyTable strategies={focusAutopsy.strategies} bestId={focusAutopsy.bestStrategyId} />
          ) : null}
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
            matching.map((h) => <HitCard key={h.listing.id} hit={h} q={q} />)
          ) : (
            <Empty
              title={
                brief?.hasProject
                  ? "Todavía no hay activos que sirvan para este proyecto con tus criterios."
                  : "Todavía no hay activos que cumplan tus criterios."
              }
              body="Dime cuánto quieres invertir y qué buscas, o relaja beneficio y plazo. Abajo tienes los que casi cumplen, con su autopsia."
            />
          )}
          {all === "1" || matching.length < 4 ? (
            <>
              <div className="text-[11px] uppercase tracking-[0.18em] text-fg-3 pt-4">
                No cumplen (todavía)
              </div>
              {others.slice(0, 8).map((h) => (
                <HitCard key={h.listing.id} hit={h} q={q} />
              ))}
            </>
          ) : (
            <Link
              href={`/app/radar?all=1${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="inline-block text-sm text-fg-2 hover:text-fg"
            >
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
            {hasOwn
              ? "Se combinan tus listados propios con los DEMO de la red FlippIA."
              : "Listados DEMO de la red FlippIA; tus propios listados (API o CSV) y los feeds autorizados se suman a ellos."}
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

function StrategyTable({
  strategies,
  bestId,
}: {
  strategies: StrategyQuickResult[];
  bestId?: string | null;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="text-left text-fg-3">
          <tr>
            <th className="py-1 pr-3 font-normal">Vía</th>
            <th className="py-1 pr-3 font-normal text-right">Beneficio</th>
            <th className="py-1 pr-3 font-normal text-right">ROE</th>
            <th className="py-1 pr-3 font-normal text-right">Capital</th>
            <th className="py-1 pr-3 font-normal text-right">Plazo</th>
            <th className="py-1 font-normal">Estado</th>
          </tr>
        </thead>
        <tbody>
          {strategies.map((s) => (
            <tr key={s.strategyId} className="border-t border-line">
              <td className="py-1.5 pr-3 text-fg">
                {s.label}
                {s.strategyId === bestId ? (
                  <Badge tone="accent" className="ml-2">
                    Mejor vía
                  </Badge>
                ) : null}
                {s.conditional ? (
                  <span className="ml-2 text-fg-3">
                    {s.blockingChecks} comprobación{s.blockingChecks === 1 ? "" : "es"}
                  </span>
                ) : null}
              </td>
              <td className="py-1.5 pr-3 text-right num">
                <Money value={s.netProfit} />
              </td>
              <td className="py-1.5 pr-3 text-right num">
                <Pct value={s.roe} />
              </td>
              <td className="py-1.5 pr-3 text-right num">
                <Money value={s.equityRequired} />
              </td>
              <td className="py-1.5 pr-3 text-right num">{s.durationMonths} m</td>
              <td className="py-1.5 text-fg-2">
                {s.meetsCriteria ? "Cumple" : s.failedCriteria.slice(0, 2).join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HitCard({ hit, q }: { hit: Hit; q?: string }) {
  const u = hit.underwriting;
  const okStrategies = hit.strategies?.filter((s) => s.meetsCriteria).length ?? 0;
  if (hit.strategies && hit.strategies.length === 0) {
    // Nothing to underwrite: the asset is not what the project asks for, or no requested way applies to it.
    return (
      <Surface className="p-4 opacity-80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-fg">
              {hit.listing.title}{" "}
              {hit.listing.demo ? (
                <Badge tone="warning" className="ml-1">
                  DEMO
                </Badge>
              ) : null}
            </div>
            <div className="text-[12px] text-fg-3">
              {hit.listing.address} · {hit.listing.builtAreaM2} m²
            </div>
          </div>
          <div className="font-display text-xl num">{formatMoney(hit.listing.askingPrice)}</div>
        </div>
        <p className="mt-2 text-[12px] text-fg-2">Fuera del proyecto: {u.failedCriteria.join(" · ")}.</p>
      </Surface>
    );
  }
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
            ) : null}
            {hit.bestStrategyId ? (
              <Badge tone="accent" className="ml-1">
                {strategyLabel(hit.bestStrategyId)}
              </Badge>
            ) : null}
          </div>
          <div className="text-[12px] text-fg-3">
            {hit.listing.address} · {hit.listing.builtAreaM2} m² · {hit.listing.condition}
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
      {hit.strategies && hit.strategies.length > 1 ? (
        <p className="mt-2 text-[12px] text-fg-3">
          Otras vías:{" "}
          {hit.strategies
            .filter((s) => s.strategyId !== hit.bestStrategyId)
            .slice(0, 3)
            .map((s) => `${s.label} (${s.meetsCriteria ? "cumple" : "no cumple"})`)
            .join(" · ")}
          {okStrategies > 1 ? ` · ${okStrategies} vías cumplen` : ""}
        </p>
      ) : null}
      {!u.meetsCriteria ? (
        <p className="mt-2 text-[12px] text-warning">
          No cumple: {u.failedCriteria.join(" · ")}.
          {u.reentryPrice > 0 && u.reentryPrice < hit.listing.askingPrice
            ? ` Volvería a cumplir por debajo de ${formatMoney(u.reentryPrice)}.`
            : ""}
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
          href={`/app/radar?listing=${hit.listing.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className="rounded-[var(--radius-md)] border border-line px-3 py-1.5 text-[13px] text-fg-2 hover:text-fg"
        >
          Autopsia
        </Link>
        <WatchButton listingId={hit.listing.id} label={hit.listing.title} price={hit.listing.askingPrice} />
      </div>
    </Surface>
  );
}
