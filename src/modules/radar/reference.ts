import type { OpportunityListing } from "@/modules/adapters/sources/types";
import { LIQUIDITY_REFERENCE_DAYS, liquidityFromDepth, median } from "@/modules/adapters/market/stats";
import type { CityProfile, Microzone } from "@/modules/city/types";
import { DEFAULT_ADJUSTMENTS } from "@/modules/engines/valuation/arv";

/**
 * Market reference the Radar underwrites against, per microzone. Built from
 * the real active listings of the zone when there are enough; otherwise the
 * microzone's DEMO table, and the underwriting says so.
 */
export interface MarketReference {
  residentialRenovatedPerM2: number;
  residentialUnrenovatedPerM2: number;
  commercialPerM2: number;
  daysToSell: number;
  liquidity: "high" | "medium" | "low";
  demand: "high" | "medium" | "low";
  basis: "listings" | "demo";
  sampleSize: number;
}

/** Real listings a zone needs before its own supply replaces the DEMO table. */
export const MIN_LISTINGS_FOR_REFERENCE = 5;

export function demoReference(zone: Microzone): MarketReference {
  const m = zone.demoMarket;
  return {
    residentialRenovatedPerM2: m.residentialRenovatedPerM2,
    residentialUnrenovatedPerM2: m.residentialUnrenovatedPerM2,
    commercialPerM2: m.commercialPerM2,
    daysToSell: m.daysToSell,
    liquidity: m.liquidity,
    demand: m.demand,
    basis: "demo",
    sampleSize: 0,
  };
}

/**
 * €/m² by condition from the zone's real listings, net of the standard
 * asking-price discount so a listing is compared with value, not with other
 * asking prices. Conditions without sample are shifted from the overall
 * median with the valuation engine's condition adjustments.
 */
export function referenceFromListings(zone: Microzone, listings: OpportunityListing[]): MarketReference {
  const real = listings.filter(
    (l) => !l.demo && l.microzoneId === zone.id && l.askingPrice > 0 && l.builtAreaM2 > 0,
  );
  const residential = real.filter((l) => l.assetUse === "residential");
  if (residential.length < MIN_LISTINGS_FOR_REFERENCE) return demoReference(zone);
  const net = 1 - DEFAULT_ADJUSTMENTS.askingDiscount;
  const ppm2 = (l: OpportunityListing) => (l.askingPrice / l.builtAreaM2) * net;
  const overall = median(residential.map(ppm2));
  const renovated = residential.filter((l) => l.condition === "renovated").map(ppm2);
  const unrenovated = residential.filter((l) => l.condition === "to_renovate").map(ppm2);
  const adj = DEFAULT_ADJUSTMENTS.conditionAdjustment;
  const commercial = real.filter((l) => l.assetUse === "commercial").map(ppm2);
  const liquidity = liquidityFromDepth(real.length);
  return {
    residentialRenovatedPerM2: Math.round(
      renovated.length >= 2 ? median(renovated) : overall * (1 + adj.unknown),
    ),
    residentialUnrenovatedPerM2: Math.round(
      unrenovated.length >= 2 ? median(unrenovated) : overall / (1 + adj.unrenovated - adj.unknown),
    ),
    commercialPerM2: Math.round(
      commercial.length >= 2 ? median(commercial) : zone.demoMarket.commercialPerM2,
    ),
    daysToSell: LIQUIDITY_REFERENCE_DAYS[liquidity],
    liquidity,
    demand: liquidity,
    basis: "listings",
    sampleSize: residential.length,
  };
}

export function referencesFor(
  city: CityProfile,
  listings: OpportunityListing[],
): Map<string, MarketReference> {
  const out = new Map<string, MarketReference>();
  for (const zone of city.microzones) out.set(zone.id, referenceFromListings(zone, listings));
  return out;
}
