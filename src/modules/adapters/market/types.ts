import type { LatLng } from "@/modules/city/types";
import type { Comparable } from "@/modules/engines/valuation/types";

export interface MarketQuery {
  microzoneId: string;
  point?: LatLng;
  assetUse: "residential" | "commercial" | "office" | "other";
  areaM2: number;
  analysisDate: string;
}

export interface MarketSnapshot {
  microzoneId: string;
  microzoneName: string;
  comparablesSale: Comparable[];
  comparablesRent: Array<{ id: string; monthlyRent: number; areaM2: number; date: string; distanceM: number; type: "asking" | "transaction"; demo: boolean }>;
  stats: {
    renovatedPerM2: number;
    unrenovatedPerM2: number;
    spreadPerM2: number;
    rentPerM2Month: number;
    daysToSell: number;
    liquidity: "high" | "medium" | "low";
    demand: "high" | "medium" | "low";
    sampleSize: number;
    confidenceNote: string;
  };
  demo: boolean;
}
