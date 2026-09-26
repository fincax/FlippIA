import type { DataSourceAdapter } from "../types";
import { MarketDemoAdapter } from "./demo";
import type { MarketQuery, MarketSnapshot } from "./types";

export * from "./types";
export { MarketDemoAdapter };
export type MarketAdapter = DataSourceAdapter<MarketQuery, MarketSnapshot>;

export function createMarketAdapter(mode = process.env.MARKET_SOURCE_MODE ?? "demo"): MarketAdapter {
  // Partner feeds plug in here (MARKET_SOURCE_MODE=partner) once an authorised source exists.
  if (mode === "demo") return new MarketDemoAdapter();
  throw new Error(`MARKET_SOURCE_MODE "${mode}" is not implemented yet (demo)`);
}
