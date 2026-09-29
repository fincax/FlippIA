import { describe, expect, it } from "vitest";
import type { OpportunityListing } from "@/modules/adapters/sources/types";
import { defaultCity } from "@/modules/city/registry";
import { DEFAULT_INVESTOR_DNA } from "@/modules/investor/types";
import { MIN_LISTINGS_FOR_REFERENCE, referenceFromListings } from "./reference";
import { quickUnderwrite, radarSearch } from "./underwrite";

const city = defaultCity();
const zone = city.microzones.find((z) => z.id === "sev-triana")!;

function listing(i: number, overrides: Partial<OpportunityListing> = {}): OpportunityListing {
  return {
    id: `lst_${i}`,
    sourceId: "idealista-api",
    title: `Piso ${i}`,
    address: `Calle ${i}, Triana`,
    microzoneId: zone.id,
    typology: "flat",
    assetUse: "residential",
    builtAreaM2: 100,
    condition: i % 2 ? "renovated" : "to_renovate",
    askingPrice: i % 2 ? 400_000 : 260_000,
    publishedAt: "2026-09-01",
    priceHistory: [{ date: "2026-09-01", price: i % 2 ? 400_000 : 260_000 }],
    demo: false,
    ...overrides,
  };
}

describe("Radar market reference", () => {
  it("falls back to the DEMO table below the minimum sample and says so", () => {
    const ref = referenceFromListings(zone, [listing(1), listing(2)]);
    expect(ref.basis).toBe("demo");
    expect(ref.residentialRenovatedPerM2).toBe(zone.demoMarket.residentialRenovatedPerM2);
  });
  it("derives €/m² by condition from real listings, net of the asking discount", () => {
    const listings = Array.from({ length: MIN_LISTINGS_FOR_REFERENCE + 3 }, (_, i) => listing(i));
    const ref = referenceFromListings(zone, listings);
    expect(ref.basis).toBe("listings");
    expect(ref.sampleSize).toBe(listings.length);
    expect(ref.residentialRenovatedPerM2).toBe(3_800);
    expect(ref.residentialUnrenovatedPerM2).toBe(2_470);
    expect(ref.liquidity).toBe("low");
    expect(ref.daysToSell).toBe(150);
  });
  it("ignores DEMO listings and other zones", () => {
    const listings = Array.from({ length: 10 }, (_, i) => listing(i, { demo: i < 6 }));
    expect(referenceFromListings(zone, listings).basis).toBe("demo");
    const elsewhere = Array.from({ length: 10 }, (_, i) => listing(i, { microzoneId: "sev-nervion" }));
    expect(referenceFromListings(zone, elsewhere).basis).toBe("demo");
  });
  it("underwriting against a real reference is not DEMO; against the table it is", () => {
    const listings = Array.from({ length: 8 }, (_, i) => listing(i));
    const hits = radarSearch(listings, DEFAULT_INVESTOR_DNA, {
      includeNonMatching: true,
      analysisDate: "2026-09-29",
    });
    expect(hits).toHaveLength(8);
    expect(hits.every((h) => h.underwriting.referenceBasis === "listings" && !h.underwriting.demo)).toBe(
      true,
    );
    const single = quickUnderwrite(listing(0), DEFAULT_INVESTOR_DNA, { analysisDate: "2026-09-29" });
    expect(single?.referenceBasis).toBe("demo");
    expect(single?.demo).toBe(true);
  });
});
