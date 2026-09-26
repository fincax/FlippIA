import type { DataSourceAdapter } from "../types";
import { FinancingDemoAdapter } from "./demo";
import type { FinancingOffer, FinancingQuery } from "./types";

export * from "./types";
export { FinancingDemoAdapter };
export type FinancingProviderAdapter = DataSourceAdapter<FinancingQuery, FinancingOffer[]>;

export function createFinancingAdapter(
  _mode = process.env.FINANCING_PROVIDER_MODE ?? "demo",
): FinancingProviderAdapter {
  return new FinancingDemoAdapter();
}
