import type { DataSourceAdapter } from "../types";
import { FinancingDemoAdapter } from "./demo";
import type { FinancingOffer, FinancingQuery } from "./types";

export * from "./types";
export { FinancingDemoAdapter };
export type FinancingProviderAdapter = DataSourceAdapter<FinancingQuery, FinancingOffer[]>;

export function createFinancingAdapter(
  mode = process.env.FINANCING_PROVIDER_MODE ?? "demo",
): FinancingProviderAdapter {
  if (mode === "demo") return new FinancingDemoAdapter();
  throw new Error(`FINANCING_PROVIDER_MODE "${mode}" is not implemented yet (demo)`);
}
