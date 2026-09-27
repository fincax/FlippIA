import type { LatLng } from "@/modules/city/types";
import type { Comparable, ComparableType } from "@/modules/engines/valuation/types";

export interface MarketQuery {
  microzoneId: string;
  point?: LatLng;
  assetUse: "residential" | "commercial" | "office" | "other";
  areaM2: number;
  analysisDate: string;
}

export interface RentComparable {
  id: string;
  monthlyRent: number;
  areaM2: number;
  date: string;
  distanceM: number;
  type: "asking" | "transaction";
  demo: boolean;
  /** Adapter that produced it. */
  sourceId?: string;
  label?: string;
}

export interface MarketSourceSummary {
  sourceId: string;
  name: string;
  sale: number;
  rent: number;
  demo: boolean;
}

export interface MarketSnapshot {
  microzoneId: string;
  microzoneName: string;
  comparablesSale: Comparable[];
  comparablesRent: RentComparable[];
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
    /** Where liquidity figures come from: measured by a source, a stated reference assumption, or synthetic DEMO. */
    liquidityBasis?: "measured" | "reference" | "demo";
  };
  /** Providers that contributed, with their counts. */
  sources?: MarketSourceSummary[];
  demo: boolean;
}

/** A comparable the organisation owns: a transaction it closed, a valuation it commissioned, a witness it verified. */
export interface OwnComparable {
  id: string;
  kind: "sale" | "rent";
  type: Exclude<ComparableType, "asking">;
  /** Sale price in EUR, or monthly rent for kind = rent. */
  price: number;
  areaM2: number;
  /** ISO date of the transaction / valuation. */
  date: string;
  point: LatLng;
  microzoneId?: string;
  condition: Comparable["condition"];
  assetUse: Comparable["assetUse"];
  floor?: number;
  elevator?: boolean;
  exterior?: boolean;
  label?: string;
  /** Registry, notary or internal reference. */
  reference?: string;
  /** Who verified it and how. */
  note?: string;
}

/**
 * Tenant-scoped access to own comparables. Implemented by the server (DB)
 * and injected into the adapter set per request; the modules never touch the DB.
 */
export interface ComparablesRepository {
  list(query: {
    microzoneId: string;
    point?: LatLng;
    radiusM: number;
    assetUse: MarketQuery["assetUse"];
  }): Promise<OwnComparable[]>;
}
