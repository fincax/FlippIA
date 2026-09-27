import { appError, err, ok, type Result } from "@/modules/core/result";
import { logger } from "@/modules/core/logger";
import type { NewEvidence } from "@/modules/evidence/store";
import type { AdapterResponse, DataSourceAdapter } from "../types";
import { deriveStats } from "./stats";
import type { MarketQuery, MarketSnapshot, MarketSourceSummary } from "./types";

export type MarketAdapter = DataSourceAdapter<MarketQuery, MarketSnapshot>;

/** Below this many real sale comparables the valuation is not trustworthy and the DEMO fallback (when allowed) takes over. */
export const MIN_REAL_SALE_COMPARABLES = 3;

/**
 * Merges several market providers into one snapshot: own comparables first
 * (transactions), then authorised listing feeds. When the real providers do
 * not reach the minimum sample, the labelled DEMO adapter fills in and the
 * snapshot is marked `demo: true` with an explicit note — synthetic data is
 * never mixed in silently.
 */
export class CompositeMarketAdapter implements MarketAdapter {
  sourceId = "market-composite";
  sourceType = "market_listing" as const;
  sourceName: string;
  sourceAuthority = "Fuentes de mercado configuradas";
  mode: MarketAdapter["mode"];

  constructor(
    readonly providers: MarketAdapter[],
    readonly fallback?: MarketAdapter,
  ) {
    if (!providers.length) throw new Error("CompositeMarketAdapter requires at least one provider");
    this.sourceName = providers.map((p) => p.sourceName).join(" + ");
    this.mode = providers.some((p) => p.mode === "partner")
      ? "partner"
      : (providers[0]?.mode ?? "unavailable");
  }

  async isAvailable() {
    const flags = await Promise.all(this.providers.map((p) => p.isAvailable()));
    return flags.some(Boolean);
  }

  async query(q: MarketQuery): Promise<Result<AdapterResponse<MarketSnapshot>>> {
    const results = await Promise.all(
      this.providers.map(async (p) => ({ provider: p, result: await p.query(q) })),
    );
    const failures: string[] = [];
    const evidence: NewEvidence[] = [];
    const sources: MarketSourceSummary[] = [];
    let sale: MarketSnapshot["comparablesSale"] = [];
    let rent: MarketSnapshot["comparablesRent"] = [];
    let depth = 0;
    let microzoneName: string | undefined;
    let freshness: string | undefined;
    for (const { provider, result } of results) {
      if (!result.ok) {
        failures.push(`${provider.sourceName}: ${result.error.message}`);
        logger.warn("market.provider_failed", { sourceId: provider.sourceId, code: result.error.code });
        continue;
      }
      const s = result.value.data;
      microzoneName ??= s.microzoneName;
      freshness ??= result.value.freshness;
      sale = sale.concat(s.comparablesSale.filter((c) => !c.demo));
      rent = rent.concat(s.comparablesRent.filter((c) => !c.demo));
      depth += Math.max(s.stats.sampleSize, s.comparablesSale.length);
      evidence.push(...result.value.evidence);
      sources.push(
        ...(s.sources ?? [
          {
            sourceId: provider.sourceId,
            name: provider.sourceName,
            sale: s.comparablesSale.length,
            rent: s.comparablesRent.length,
            demo: s.demo,
          },
        ]),
      );
    }
    sale = dedupe(sale);
    rent = dedupe(rent);
    const notes = failures.map((f) => `Fuente no disponible: ${f.replace(/\.$/, "")}.`);

    if (sale.length >= MIN_REAL_SALE_COMPARABLES && rent.length > 0) {
      const stats = deriveStats({ sale, rent, marketDepth: depth, notes });
      return ok({
        data: {
          microzoneId: q.microzoneId,
          microzoneName: microzoneName ?? q.microzoneId,
          comparablesSale: sale,
          comparablesRent: rent,
          stats,
          sources,
          demo: false,
        },
        evidence,
        retrievedAt: new Date().toISOString(),
        freshness,
        mode: this.mode,
      });
    }

    if (!this.fallback) {
      if (!sale.length && failures.length === results.length)
        return err(
          appError("SOURCE_UNAVAILABLE", `Ninguna fuente de mercado respondió. ${failures.join(" · ")}`),
        );
      const stats = deriveStats({
        sale,
        rent,
        marketDepth: depth,
        notes: [
          ...notes,
          `Muestra real insuficiente (${sale.length} comparables de venta, ${rent.length} de alquiler); no hay fuente DEMO de respaldo.`,
        ],
      });
      return ok({
        data: {
          microzoneId: q.microzoneId,
          microzoneName: microzoneName ?? q.microzoneId,
          comparablesSale: sale,
          comparablesRent: rent,
          stats,
          sources,
          demo: false,
        },
        evidence,
        retrievedAt: new Date().toISOString(),
        freshness,
        mode: this.mode,
      });
    }

    const demo = await this.fallback.query(q);
    if (!demo.ok) return demo;
    const d = demo.value.data;
    const mergedSale = sale.length >= MIN_REAL_SALE_COMPARABLES ? sale : sale.concat(d.comparablesSale);
    const mergedRent = rent.length ? rent : d.comparablesRent;
    const stats = deriveStats({
      sale: mergedSale,
      rent: mergedRent,
      marketDepth: depth,
      notes: [
        ...notes,
        `Muestra real insuficiente (${sale.length} comparables de venta reales, ${rent.length} de alquiler): se completa con datos DEMO sintéticos, marcados como tales.`,
      ],
      liquidity: {
        level: d.stats.liquidity,
        demand: d.stats.demand,
        daysToSell: d.stats.daysToSell,
        basis: "demo",
        note: "Liquidez y días de venta DEMO de la microzona.",
      },
    });
    return ok({
      data: {
        microzoneId: q.microzoneId,
        microzoneName: microzoneName ?? d.microzoneName,
        comparablesSale: mergedSale,
        comparablesRent: mergedRent,
        stats,
        sources: [
          ...sources,
          ...(d.sources ?? [
            {
              sourceId: this.fallback.sourceId,
              name: this.fallback.sourceName,
              sale: d.comparablesSale.length,
              rent: d.comparablesRent.length,
              demo: true,
            },
          ]),
        ],
        demo: true,
      },
      evidence: [...evidence, ...demo.value.evidence],
      retrievedAt: new Date().toISOString(),
      freshness,
      mode: this.mode,
    });
  }
}

function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}
