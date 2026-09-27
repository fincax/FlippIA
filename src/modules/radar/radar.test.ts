import { describe, expect, it } from "vitest";
import { generateDemoListings } from "@/modules/adapters/sources/demo";
import { defaultCity, microzonesFromText } from "@/modules/city/registry";
import { DEFAULT_INVESTOR_DNA } from "@/modules/investor/types";
import { STRATEGY_PLUGINS } from "@/modules/strategies/plugins";
import { autopsy } from "@/modules/watch/rules";
import { applyBriefToDna, parseProjectBrief, strategySetFor } from "./brief";
import { listingStrategyContext } from "./context";
import { quickUnderwriteStrategies } from "./strategies";
import { quickUnderwrite, radarSearch } from "./underwrite";

const DATE = "2026-01-15";
const listings = generateDemoListings();

describe("microzonesFromText", () => {
  it("returns every zone named, not only the best match", () => {
    const ids = microzonesFromText(defaultCity(), "Busca en Triana y Los Remedios").map((z) => z.id);
    expect(ids).toEqual(expect.arrayContaining(["sev-triana", "sev-remedios"]));
    expect(microzonesFromText(defaultCity(), "sin barrio")).toEqual([]);
  });
});

describe("parseProjectBrief", () => {
  it("reads asset, zones, price cap and strategy from a spoken project", () => {
    const b = parseProjectBrief(
      "Busco un local en Triana o la Alameda de hasta 200.000 € para convertirlo en vivienda",
    );
    expect(b.hasProject).toBe(true);
    expect(b.asset.typology).toBe("premises");
    expect(b.asset.assetUse).toBe("commercial");
    expect(b.asset.maxPrice).toBe(200_000);
    expect(b.asset.zoneIds).toEqual(expect.arrayContaining(["sev-triana", "sev-alameda"]));
    expect(b.strategyIds).toEqual(["change_of_use"]);
    expect(b.explicitCapital).toBe(false);
    expect(b.intake.intent).toBe("capital_available");
    expect(b.summary).toContain("Triana");
    expect(b.summary).toContain("cambio de uso");
  });

  it("keeps the classic budget sentence as a budget, not a project", () => {
    const b = parseProjectBrief(
      "Tengo 300.000 €. Quiero aportar máximo 120.000 €. Sevilla. Horizonte inferior a 12 meses.",
    );
    expect(b.hasProject).toBe(false);
    expect(b.explicitCapital).toBe(true);
    expect(b.asset.maxPrice).toBeUndefined();
    expect(b.intake.investor).toMatchObject({ capital: 300_000, maxEquity: 120_000, horizonMonths: 12 });
    expect(strategySetFor(b, DEFAULT_INVESTOR_DNA)).toBeUndefined();
  });

  it("maps income wording to the hold family and a minimum surface", () => {
    const b = parseProjectBrief("Quiero un piso de más de 90 m2 para alquilar en Nervión");
    expect(b.families).toEqual(["hold"]);
    expect(b.objective).toBe("income");
    expect(b.asset.minAreaM2).toBe(90);
    expect(b.asset.zoneIds).toEqual(["sev-nervion"]);
    const set = strategySetFor(b, DEFAULT_INVESTOR_DNA)!;
    expect(set.every((id) => STRATEGY_PLUGINS.find((p) => p.id === id)?.family === "hold")).toBe(true);
  });

  it("does not throw on unrelated text", () => {
    const b = parseProjectBrief("hola");
    expect(b.hasProject).toBe(false);
    expect(b.asset.zoneIds).toEqual([]);
  });
});

describe("applyBriefToDna", () => {
  it("reproduces the historic override for a spoken budget", () => {
    const b = parseProjectBrief(
      "Tengo 300.000 €. Quiero aportar máximo 120.000 €. Horizonte inferior a 12 meses.",
    );
    const dna = applyBriefToDna(DEFAULT_INVESTOR_DNA, b);
    expect(dna.capitalAvailable).toBe(300_000);
    expect(dna.maxEquityPerDeal).toBe(120_000);
    expect(dna.horizonMonths).toBe(12);
    expect(dna.ticketMax).toBe(Math.max(DEFAULT_INVESTOR_DNA.ticketMax, 300_000 * 1.6));
    expect(dna.zones).toEqual(DEFAULT_INVESTOR_DNA.zones);
  });

  it("treats a price cap as a ticket, never as capital, and applies spoken zones", () => {
    const b = parseProjectBrief("Busca oportunidades en Triana y Los Remedios con menos de 250.000 €");
    const dna = applyBriefToDna(DEFAULT_INVESTOR_DNA, b);
    expect(dna.capitalAvailable).toBe(DEFAULT_INVESTOR_DNA.capitalAvailable);
    expect(dna.maxEquityPerDeal).toBe(DEFAULT_INVESTOR_DNA.maxEquityPerDeal);
    expect(dna.ticketMax).toBe(250_000);
    expect(dna.zones).toEqual(expect.arrayContaining(["sev-triana", "sev-remedios"]));
  });
});

describe("radarSearch", () => {
  it("is unchanged without a project: same hits as before the brief existed", () => {
    const b = parseProjectBrief("Tengo 250.000 €. Encuentra algo.");
    const legacy = radarSearch(listings, DEFAULT_INVESTOR_DNA, {
      includeNonMatching: true,
      analysisDate: DATE,
    });
    const withBrief = radarSearch(listings, DEFAULT_INVESTOR_DNA, {
      includeNonMatching: true,
      analysisDate: DATE,
      brief: b,
    });
    expect(withBrief).toEqual(legacy);
    expect(legacy.every((h) => h.strategies === undefined)).toBe(true);
  });

  it("applies spoken zones and price cap as explained failures in classic mode", () => {
    const b = parseProjectBrief("Busca oportunidades en Triana con menos de 150.000 €");
    const dna = applyBriefToDna(DEFAULT_INVESTOR_DNA, b);
    const hits = radarSearch(listings, dna, { includeNonMatching: true, analysisDate: DATE, brief: b });
    const outside = hits.find((h) => h.listing.microzoneId !== "sev-triana")!;
    expect(outside.underwriting.failedCriteria.some((f) => f.includes("fuera de tus zonas"))).toBe(true);
    const pricey = hits.find((h) => h.listing.askingPrice > 150_000)!;
    expect(pricey.underwriting.failedCriteria.some((f) => f.includes("tope 150.000"))).toBe(true);
    expect(hits.every((h) => h.strategies === undefined)).toBe(true);
  });

  it("underwrites every listing through the requested MultiExit strategies for a project", () => {
    const b = parseProjectBrief(
      "Busco un local en Triana o la Alameda de hasta 200.000 € para convertirlo en vivienda",
    );
    const dna = applyBriefToDna(DEFAULT_INVESTOR_DNA, b);
    const hits = radarSearch(listings, dna, { includeNonMatching: true, analysisDate: DATE, brief: b });
    expect(hits.length).toBe(listings.filter((l) => l.microzoneId).length);
    expect(hits.every((h) => Array.isArray(h.strategies))).toBe(true);
    const premises = hits.filter((h) => h.listing.typology === "premises" && h.bestStrategyId);
    expect(premises.length).toBeGreaterThan(0);
    expect(premises.every((h) => h.bestStrategyId === "change_of_use")).toBe(true);
    expect(premises.every((h) => h.why.some((w) => w.startsWith("Mejor vía: Cambio de uso")))).toBe(true);
    const flat = hits.find((h) => h.listing.assetUse === "residential")!;
    expect(flat.bestStrategyId).toBeNull();
    expect(flat.underwriting.meetsCriteria).toBe(false);
    expect(flat.underwriting.failedCriteria).toEqual(
      expect.arrayContaining([
        "Uso residencial, buscas comercial",
        "Ninguna de las vías pedidas aplica a este activo",
      ]),
    );
  });

  it("chooses the best hold strategy for an income project", () => {
    const b = parseProjectBrief("Quiero un piso para alquilar");
    const dna = applyBriefToDna(DEFAULT_INVESTOR_DNA, b);
    const hits = radarSearch(listings, dna, { includeNonMatching: true, analysisDate: DATE, brief: b });
    const flats = hits.filter((h) => h.listing.assetUse === "residential");
    expect(flats.length).toBeGreaterThan(0);
    for (const h of flats) {
      expect(h.strategies!.length).toBeGreaterThan(0);
      expect(h.strategies!.every((s) => s.family === "hold")).toBe(true);
      expect(h.strategies!.map((s) => s.strategyId)).toContain(h.bestStrategyId);
    }
  });

  it("honours the strategies saved in the Investor DNA", () => {
    const dna = { ...DEFAULT_INVESTOR_DNA, strategies: ["flip_light"] };
    const hits = radarSearch(listings, dna, { includeNonMatching: true, analysisDate: DATE });
    expect(hits.every((h) => (h.strategies ?? []).every((s) => s.strategyId === "flip_light"))).toBe(true);
  });
});

describe("quick strategy context", () => {
  it("speaks the same numbers as the classic quick pass and marks everything inferred", () => {
    const l = listings.find((x) => x.assetUse === "residential" && x.condition === "to_renovate")!;
    const ctx = listingStrategyContext(l, DEFAULT_INVESTOR_DNA, { analysisDate: DATE })!;
    const classic = quickUnderwrite(l, DEFAULT_INVESTOR_DNA, { analysisDate: DATE })!;
    expect(ctx.market.valuationRenovated.value.point).toBe(classic.arv);
    expect(ctx.market.askingVsValue.asIsValue).toBe(classic.asIsValue);
    expect(ctx.market.status).toBe("INFERRED");
    expect(ctx.urbanism.humanReviewRequired).toBe(true);
    expect(ctx.architecture.alternatives.length).toBeGreaterThan(0);
    expect(ctx.finance.stacks.some((s) => s.id === "stack_mortgage")).toBe(true);
    expect(ctx.property.property.demo).toBe(true);
  });

  it("returns null for a listing outside every microzone", () => {
    const orphan = { ...listings[0]!, microzoneId: "nowhere" };
    expect(listingStrategyContext(orphan, DEFAULT_INVESTOR_DNA)).toBeNull();
    expect(quickUnderwriteStrategies(orphan, DEFAULT_INVESTOR_DNA)).toBeNull();
  });

  it("ranks strategies that meet the criteria first and exposes checks", () => {
    const l = listings.find((x) => x.assetUse === "residential" && x.condition === "to_renovate")!;
    const u = quickUnderwriteStrategies(l, DEFAULT_INVESTOR_DNA, { analysisDate: DATE })!;
    expect(u.strategies.length).toBeGreaterThan(1);
    const firstMiss = u.strategies.findIndex((s) => !s.meetsCriteria);
    const lastHit = u.strategies.map((s) => s.meetsCriteria).lastIndexOf(true);
    if (firstMiss >= 0 && lastHit >= 0) expect(lastHit).toBeLessThan(firstMiss);
    expect(u.bestStrategyId).toBe(u.strategies[0]!.strategyId);
    expect(u.strategies.every((s) => typeof s.blockingChecks === "number")).toBe(true);
  });
});

describe("autopsy with a project", () => {
  it("names the best way in and lists every strategy", () => {
    const b = parseProjectBrief("Quiero un piso para alquilar");
    const dna = applyBriefToDna(DEFAULT_INVESTOR_DNA, b);
    const l = listings.find((x) => x.assetUse === "residential")!;
    const a = autopsy(l, dna, { brief: b });
    expect(a.strategies?.length).toBeGreaterThan(0);
    expect(a.bestStrategyId).toBeTruthy();
    expect(a.headline).toMatch(/vía/);
    const classic = autopsy(l, DEFAULT_INVESTOR_DNA);
    expect(classic.strategies).toBeUndefined();
  });
});
