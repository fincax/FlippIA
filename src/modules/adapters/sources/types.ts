import type { PropertyTypology } from "@/modules/property/types";

/**
 * Opportunity sources feed the Radar. Every listing carries its origin and
 * whether it is synthetic. No scraping: only feeds with permission
 * (partners, APIs, CSV, manual, webhooks, forms, own network).
 */
export interface OpportunityListing {
  id: string;
  sourceId: string;
  reference?: string;
  title: string;
  address: string;
  microzoneId?: string;
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
  demo: boolean;
}

export interface SourceAdapter {
  sourceId: string;
  sourceName: string;
  kind: "manual" | "csv" | "partner" | "api" | "webhook" | "network" | "demo";
  isAvailable(): Promise<boolean>;
  listings(filter?: {
    microzoneIds?: string[];
    maxPrice?: number;
    assetUse?: OpportunityListing["assetUse"];
  }): Promise<OpportunityListing[]>;
}
