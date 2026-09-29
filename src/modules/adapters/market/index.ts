import type { DataSourceAdapter } from "../types";
import { CompositeMarketAdapter, MIN_REAL_SALE_COMPARABLES } from "./composite";
import { MarketDemoAdapter } from "./demo";
import { IdealistaClient, sharedIdealistaClient } from "../idealista";
import { IdealistaMarketAdapter, type IdealistaConfig } from "./idealista";
import { OwnComparablesAdapter } from "./own";
import type { ComparablesRepository, MarketQuery, MarketSnapshot } from "./types";

export * from "./types";
export {
  MarketDemoAdapter,
  IdealistaMarketAdapter,
  OwnComparablesAdapter,
  CompositeMarketAdapter,
  MIN_REAL_SALE_COMPARABLES,
};
export type MarketAdapter = DataSourceAdapter<MarketQuery, MarketSnapshot>;

export const MARKET_SOURCE_MODES = ["demo", "own", "idealista"] as const;
export type MarketSourceMode = (typeof MARKET_SOURCE_MODES)[number];

/** `MARKET_SOURCE_MODE` is a comma-separated list of providers, e.g. `own,idealista`. */
export function parseMarketModes(value: string | undefined): string[] {
  return (value ?? "demo")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export interface MarketAdapterDeps {
  /** Tenant-scoped repository of own comparables (required for mode `own`). */
  ownComparables?: ComparablesRepository;
  idealista?: Partial<IdealistaConfig>;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

/**
 * Builds the market adapter from `MARKET_SOURCE_MODE`. Real providers are
 * combined; when `demo` is also listed (or nothing real is configured) the
 * labelled DEMO adapter acts as fallback for thin samples.
 */
export function createMarketAdapter(mode?: string, deps: MarketAdapterDeps = {}): MarketAdapter {
  const env = deps.env ?? process.env;
  const modes = parseMarketModes(mode ?? env.MARKET_SOURCE_MODE);
  const unknown = modes.filter((m) => !(MARKET_SOURCE_MODES as readonly string[]).includes(m));
  if (unknown.length)
    throw new Error(
      `MARKET_SOURCE_MODE "${unknown.join(",")}" is not supported (${MARKET_SOURCE_MODES.join(" | ")})`,
    );
  const providers: MarketAdapter[] = [];
  if (modes.includes("own") && deps.ownComparables)
    providers.push(new OwnComparablesAdapter(deps.ownComparables));
  if (modes.includes("idealista")) {
    const client =
      deps.idealista?.apiKey || deps.idealista?.apiSecret || deps.fetchImpl
        ? new IdealistaClient(
            {
              apiKey: deps.idealista?.apiKey ?? env.IDEALISTA_API_KEY ?? "",
              apiSecret: deps.idealista?.apiSecret ?? env.IDEALISTA_API_SECRET ?? "",
              country: deps.idealista?.country ?? env.IDEALISTA_COUNTRY ?? "es",
              ...(deps.idealista?.baseUrl ? { baseUrl: deps.idealista.baseUrl } : {}),
            },
            deps.fetchImpl,
          )
        : sharedIdealistaClient(env);
    providers.push(
      new IdealistaMarketAdapter(client, undefined, {
        radiusM: deps.idealista?.radiusM ?? (Number(env.IDEALISTA_RADIUS_M) || undefined),
      }),
    );
  }
  const demo = new MarketDemoAdapter();
  if (!providers.length) return demo;
  const wantsDemoFallback = modes.includes("demo");
  return new CompositeMarketAdapter(providers, wantsDemoFallback ? demo : undefined);
}
