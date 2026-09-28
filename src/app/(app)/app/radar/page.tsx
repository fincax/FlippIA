import Link from "next/link";
import { Badge, Empty, Money, Pct } from "@/components/ds";
import { PriceSparkline } from "@/components/flippia/visual/price-sparkline";
import { RadarScope } from "@/components/flippia/visual/radar-scope";
import { WatchButton } from "@/components/flippia/watch-button";
import { cn } from "@/lib/cn";
import { formatMoney, formatRelative } from "@/lib/format";
import { labelCondition } from "@/lib/labels";
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

/**
 * Radar — air traffic control for real estate opportunities.
 * Same sources, same Radar Engine, same reverse-investing override (a spoken
 * brief, the MultiExit quick pass); the scope and the strip board only
 * present what `runRadar` returns.
 */
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
  // For a spoken search: the zones named in the brief and, per zone, the assets that fit the project
  // but do not meet the criteria yet.
  const focusIds = brief?.asset.zoneIds ?? [];
  const candidates = brief
    ? Object.entries(
        others
          .filter(
            (h) => fits(h) === 1 && (brief.hasProject || focusIds.includes(h.listing.microzoneId ?? "")),
          )
          .reduce<Record<string, number>>((acc, h) => {
            const id = h.listing.microzoneId ?? "";
            acc[id] = (acc[id] ?? 0) + 1;
            return acc;
          }, {}),
      ).map(([microzoneId, count]) => ({ microzoneId, count }))
    : [];
  const focus = focusId ? hits.find((h) => h.listing.id === focusId) : undefined;
  const focusAutopsy = focus ? autopsy(focus.listing, dna, { brief }) : null;
  const hasOwn = hits.some((h) => !h.listing.demo);
  const maxScore = Math.max(1, ...hits.map((h) => h.score));
  // One blip per hit on the scope. Candidates for a spoken search light up too, so the
  // zones where the project fits stay visible even before the criteria are met.
  const blips = hits
    .filter((h) => h.listing.microzoneId)
    .map((h, i) => ({
      id: h.listing.id,
      microzoneId: h.listing.microzoneId ?? "",
      intensity: h.score / maxScore,
      active: h.underwriting.meetsCriteria || (brief ? fits(h) === 1 : false),
      focused: h.listing.id === focusId,
      label:
        h.underwriting.meetsCriteria || h.listing.id === focusId ? String(i + 1).padStart(2, "0") : undefined,
    }));
  const showOthers = all === "1" || matching.length < 4;
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";
  return (
    <div className="space-y-8">
      {/* ── flight plan ─────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">Radar FlippIA</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1">
            {brief?.hasProject ? "Inmuebles para tu proyecto" : "Discrepancias de valor, no pisos baratos"}
          </h1>
          {brief?.hasProject ? (
            <p className="text-sm text-fg-2 mt-2">Proyecto: {brief.summary}.</p>
          ) : q ? (
            <p className="text-sm text-fg-2 mt-2">Objetivo: «{q}».</p>
          ) : null}
          {strategySet ? (
            <p className="mt-1 text-[12px] text-fg-3 max-w-3xl">
              Cada activo se evalúa con {strategySet.length === 1 ? "la vía" : `${strategySet.length} vías`}{" "}
              {strategySet.map(strategyLabel).join(", ").toLowerCase()}; se muestra la mejor y el resto en la
              autopsia. Pase rápido con referencias de microzona: el análisis completo lo afina.
            </p>
          ) : null}
        </div>
        <Link href="/app/onboarding" className="kicker hover:text-fg">
          Ajustar Investor DNA →
        </Link>
      </section>
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-line border border-line">
        <Plan k="Capital" v={formatMoney(dna.capitalAvailable)} />
        <Plan k="Aportación máx." v={formatMoney(dna.maxEquityPerDeal)} />
        <Plan k="Horizonte" v={`${dna.horizonMonths} meses`} />
        <Plan k="Beneficio ≥" v={formatMoney(dna.targetProfit)} />
        {brief?.asset.maxPrice ? (
          <Plan k="Precio ≤" v={formatMoney(brief.asset.maxPrice)} />
        ) : (
          <Plan k="ROE ≥" v={`${Math.round(dna.targetRoe * 100)} %`} />
        )}
        <Plan
          k="Cumplen"
          v={`${matching.length} de ${hits.length}`}
          note={
            fitting !== null && brief?.hasProject
              ? `${fitting} encajan con el proyecto.`
              : !completed
                ? "Completa tu Investor DNA para afinar."
                : undefined
          }
          accent
        />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ── scope ───────────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-6 h-fit space-y-3">
          <RadarScope
            blips={blips}
            matching={matching.length}
            total={hits.length}
            className="aspect-[4/5] sm:aspect-square lg:aspect-[4/5]"
          />
          <p className="kicker normal-case tracking-normal">
            Posición esquemática por microzona.{" "}
            {focusIds.length
              ? `Buscas en ${focusIds.length === 1 ? "el barrio" : "los barrios"} que has nombrado. `
              : ""}
            {candidates.length
              ? `${candidates.reduce((n, c) => n + c.count, 0)} activos encajan con tu búsqueda y todavía no cumplen tus criterios. `
              : ""}
            {hasOwn
              ? "Se combinan tus listados propios con los DEMO de la red FlippIA."
              : "Listados DEMO de la red FlippIA; tus propios listados (API o CSV) y los feeds autorizados se suman a ellos."}
          </p>
        </div>

        {/* ── strip board ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          {focus && focusAutopsy ? (
            <section className="frame border border-accent/60 bg-surface p-5">
              <div className="kicker text-accent">Autopsia de la oportunidad</div>
              <h2 className="font-display text-xl mt-1">{focus.listing.title}</h2>
              <div className="text-sm mt-3">
                <div className="text-fg">{focusAutopsy.headline}</div>
                {focusAutopsy.reasons.length ? (
                  <ol className="mt-2 space-y-1 text-fg-2">
                    {focusAutopsy.reasons.map((r, i) => (
                      <li key={r} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
                        <span className="kicker num">{String(i + 1).padStart(2, "0")}</span>
                        {r}
                      </li>
                    ))}
                  </ol>
                ) : null}
                <p className="mt-3 text-accent">{focusAutopsy.suggestion}</p>
              </div>
              {focusAutopsy.strategies?.length ? (
                <StrategyTable strategies={focusAutopsy.strategies} bestId={focusAutopsy.bestStrategyId} />
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
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
            </section>
          ) : null}

          <section>
            <Board
              kicker="En criterio"
              title={
                matching.length
                  ? `${matching.length} ${matching.length === 1 ? "activo cumple" : "activos cumplen"}`
                  : "Ningún activo cumple todavía"
              }
            />
            {matching.length ? (
              <ol className="stagger mt-3 space-y-2">
                {matching.map((h, i) => (
                  <Strip
                    key={h.listing.id}
                    hit={h}
                    index={i}
                    maxScore={maxScore}
                    focused={h.listing.id === focusId}
                    qs={qs}
                  />
                ))}
              </ol>
            ) : (
              <div className="mt-3">
                <Empty
                  title={
                    brief?.hasProject
                      ? "Todavía no hay activos que sirvan para este proyecto con tus criterios."
                      : "Todavía no hay activos que cumplan tus criterios."
                  }
                  body="Dime cuánto quieres invertir y qué buscas, o relaja beneficio y plazo. Abajo tienes los que casi cumplen, con su autopsia."
                />
              </div>
            )}
          </section>

          {showOthers ? (
            <section>
              <Board kicker="Fuera de criterio" title="No cumplen (todavía)" />
              <ol className="stagger mt-3 space-y-2">
                {others.slice(0, 8).map((h, i) => (
                  <Strip
                    key={h.listing.id}
                    hit={h}
                    index={matching.length + i}
                    maxScore={maxScore}
                    focused={h.listing.id === focusId}
                    qs={qs}
                  />
                ))}
              </ol>
            </section>
          ) : (
            <Link href={`/app/radar?all=1${qs}`} className="inline-block kicker hover:text-fg">
              Ver también los que no cumplen →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function analyzeText(h: Hit): string {
  const l = h.listing;
  return `Analiza ${l.address}, ${l.builtAreaM2} m2${l.bedrooms ? `, ${l.bedrooms} habitaciones` : ""}${l.condition === "to_renovate" ? ", para reformar" : ""} por ${l.askingPrice} €`;
}

function Plan({ k, v, note, accent }: { k: string; v: string; note?: string; accent?: boolean }) {
  return (
    <div className="bg-surface px-3 py-2.5 min-w-0">
      <dt className="kicker truncate">{k}</dt>
      <dd className={cn("num font-display text-base mt-0.5 truncate", accent ? "text-accent" : "text-fg")}>
        {v}
      </dd>
      {note ? <dd className="text-[11px] text-warning mt-0.5">{note}</dd> : null}
    </div>
  );
}

function Board({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
      <div>
        <div className="kicker">{kicker}</div>
        <h2 className="font-display text-lg md:text-xl mt-0.5">{title}</h2>
      </div>
    </div>
  );
}

/** Every strategy the quick pass ran for a listing, best first as the engine ranked it. */
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
        <thead className="text-left">
          <tr>
            <th className="py-1 pr-3 kicker font-normal">Vía</th>
            <th className="py-1 pr-3 kicker font-normal text-right">Beneficio</th>
            <th className="py-1 pr-3 kicker font-normal text-right">ROE</th>
            <th className="py-1 pr-3 kicker font-normal text-right">Capital</th>
            <th className="py-1 pr-3 kicker font-normal text-right">Plazo</th>
            <th className="py-1 kicker font-normal">Estado</th>
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

/** A flight strip: one listing, one line of decision, one line of reasons. */
function Strip({
  hit,
  index,
  maxScore,
  focused,
  qs,
}: {
  hit: Hit;
  index: number;
  maxScore: number;
  focused: boolean;
  qs: string;
}) {
  const u = hit.underwriting;
  const l = hit.listing;
  const ok = u.meetsCriteria;
  const okStrategies = hit.strategies?.filter((s) => s.meetsCriteria).length ?? 0;
  // Nothing to underwrite: the asset is not what the project asks for, or no requested way applies to it.
  const outOfProject = hit.strategies !== undefined && hit.strategies.length === 0;
  return (
    <li
      id={l.id}
      className={cn(
        "border bg-surface scroll-mt-24",
        focused ? "border-accent/60" : ok ? "border-line" : "border-line border-dashed",
        outOfProject && "opacity-80",
      )}
    >
      <div className="grid grid-cols-[44px_minmax(0,1fr)] md:grid-cols-[52px_minmax(0,1fr)_auto]">
        <div className="border-r border-line p-3 flex flex-col items-start gap-2">
          <span className={cn("kicker num", ok ? "text-accent" : "text-fg-3")}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span aria-hidden className={cn("size-2 rounded-full", ok ? "bg-accent" : "bg-fg-3")} />
        </div>
        <div className="p-3 md:p-4 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-base md:text-lg text-fg leading-tight">{l.title}</span>
            {l.demo ? <Badge tone="warning">DEMO</Badge> : null}
            {hit.bestStrategyId ? <Badge tone="accent">{strategyLabel(hit.bestStrategyId)}</Badge> : null}
            <span className="kicker">
              {l.address} · {l.builtAreaM2} m² · {labelCondition(l.condition)} · publicado{" "}
              {formatRelative(l.publishedAt)}
            </span>
          </div>
          {outOfProject ? (
            <p className="mt-3 text-[12px] text-fg-2">Fuera del proyecto: {u.failedCriteria.join(" · ")}.</p>
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-3 2xl:grid-cols-6 gap-x-4 gap-y-3">
                <Cell k="Precio" v={formatMoney(l.askingPrice)} strong />
                <Cell
                  k="vs as-is"
                  v={u.discountVsAsIs > 0 ? `−${Math.round(u.discountVsAsIs * 100)} %` : "por encima"}
                  tone={u.discountVsAsIs > 0 ? "ok" : "bad"}
                />
                <Cell k="Beneficio" v={<Money value={u.netProfit} signed />} />
                <Cell k="ROE" v={<Pct value={u.roe} />} />
                <Cell k="Capital" v={<Money value={u.equityRequired} />} />
                <Cell k="Plazo" v={`${u.durationMonths} m`} />
              </dl>
              <PriceSparkline history={l.priceHistory} className="mt-3" />
              {hit.why.length ? (
                <ul className="mt-3 space-y-0.5 text-[12px] text-fg-2">
                  {hit.why.map((w) => (
                    <li key={w} className="grid grid-cols-[10px_minmax(0,1fr)] gap-2">
                      <span aria-hidden className="mt-1.5 size-1 bg-fg-3" />
                      {w}
                    </li>
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
              {!ok ? (
                <p className="mt-2 text-[12px] text-warning">
                  No cumple: {u.failedCriteria.join(" · ")}.
                  {u.reentryPrice > 0 && u.reentryPrice < l.askingPrice ? (
                    <>
                      {" "}
                      Volvería a cumplir por debajo de{" "}
                      <span className="num">{formatMoney(u.reentryPrice)}</span>.
                    </>
                  ) : null}
                </p>
              ) : null}
            </>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/app/analyze?q=${encodeURIComponent(analyzeText(hit))}`}
              className="bg-fg text-bg px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] hover:bg-accent hover:text-accent-ink transition-colors"
            >
              Construir el caso
            </Link>
            <Link
              href={`/app/radar?listing=${l.id}${qs}`}
              className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-2 hover:text-fg hover:border-line-strong"
            >
              Autopsia
            </Link>
            <WatchButton listingId={l.id} label={l.title} price={l.askingPrice} />
          </div>
        </div>
        <div className="hidden md:flex flex-col justify-between border-l border-line px-4 py-4 text-right w-[112px]">
          <div>
            <div className="kicker">Score</div>
            <div className="font-display text-2xl num text-fg">{hit.score}</div>
            <div className="mt-1 h-1 bg-bg-2 overflow-hidden" aria-hidden>
              <div
                className={cn("h-full", ok ? "bg-accent" : "bg-fg-3")}
                style={{ width: `${(hit.score / maxScore) * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="kicker">Diferencial</div>
            <div className="num text-[13px] text-fg">
              <Money value={u.opportunityGap} />
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function Cell({
  k,
  v,
  strong,
  tone,
}: {
  k: string;
  v: React.ReactNode;
  strong?: boolean;
  tone?: "ok" | "bad";
}) {
  return (
    <div className="min-w-0">
      <dt className="kicker truncate">{k}</dt>
      <dd
        className={cn(
          "num mt-0.5 truncate",
          strong ? "font-display text-base text-fg" : "text-[13px] text-fg-2",
          tone === "ok" && "text-verified",
          tone === "bad" && "text-danger",
        )}
      >
        {v}
      </dd>
    </div>
  );
}
