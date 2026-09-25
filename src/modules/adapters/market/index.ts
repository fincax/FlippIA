import type { DataSourceAdapter } from "../types";
import { MarketDemoAdapter } from "./demo";
import type { MarketQuery, MarketSnapshot } from "./types";

export * from "./types";
export { MarketDemoAdapter };
export type MarketAdapter = DataSourceAdapter<MarketQuery, MarketSnapshot>;

export function createMarketAdapter(_mode = process.env.MARKET_SOURCE_MODE ?? "demo"): MarketAdapter {
  // partner feeds plug in here (MARKET_SOURCE_MODE=partner) once credentials exist.
  return new MarketDemoAdapter();
}
