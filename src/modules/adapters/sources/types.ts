import type { LatLng } from "@/modules/city/types";
import type { PropertyTypology } from "@/modules/property/types";

/**
 * Opportunity sources feed the Radar. Every listing carries its origin and
 * whether it is synthetic. No scraping: only feeds with permission
 * (partners, APIs, CSV, manual, webhooks, forms, own network).
 */
export interface OpportunityListing {
  id: string;
  sourceId: string;
  /** Human name of the source, shown next to the listing. */
  sourceName?: string;
  reference?: string;
  title: string;
  address: string;
  microzoneId?: string;
  coordinates?: LatLng;
  typology: PropertyTypology;
  assetUse: "residential" | "commercial" | "office" | "industrial" | "land" | "other";
  builtAreaM2: number;
  bedrooms?: number;
  bathrooms?: number;
  floor?: number;
  elevator?: boolean;
  condition: "to_renovate" | "good" | "renovated" | "unknown";
  askingPrice: number;
  publishedAt: string;
  priceHistory: Array<{ date: string; price: number }>;
  /** Link to the original listing at the source. */
  url?: string;
  demo: boolean;
}

export interface ListingsFilter {
  microzoneIds?: string[];
  maxPrice?: number;
  assetUse?: OpportunityListing["assetUse"];
}

/** What a synchronisation run got from a source. */
export interface ListingsFetch {
  listings: OpportunityListing[];
  /** True when the run saw every active listing of the source, so absentees can be marked withdrawn. */
  complete: boolean;
  errors: string[];
}

export interface SourceAdapter {
  sourceId: string;
  sourceName: string;
  kind: "manual" | "csv" | "partner" | "api" | "webhook" | "network" | "demo";
  isAvailable(): Promise<boolean>;
  listings(filter?: ListingsFilter): Promise<OpportunityListing[]>;
  /** Full pull for synchronisation; defaults to `listings()` treated as complete. */
  fetchAll?(): Promise<ListingsFetch>;
}
