import { describe, expect, it } from "vitest";
import { estimateValue } from "./arv";
import type { Comparable } from "./types";

const comp = (over: Partial<Comparable>): Comparable => ({
  id: over.id ?? "c",
  type: "transaction",
  sourceId: "demo",
  price: 300_000,
  areaM2: 100,
  date: "2025-11-01",
  distanceM: 300,
  condition: "renovated",
  assetUse: "residential",
  demo: true,
  ...over,
});

describe("ARV estimation", () => {
  it("returns a range with point between low and high", () => {
    const r = estimateValue({
      areaM2: 90,
      targetCondition: "renovated",
      analysisDate: "2026-01-15",
      comparables: [comp({ id: "a", price: 280_000 }), comp({ id: "b", price: 300_000 }), comp({ id: "c", price: 330_000 }), comp({ id: "d", price: 310_000, type: "asking" })],
    });
    expect(r.pricePerM2.low).toBeLessThanOrEqual(r.pricePerM2.point);
    expect(r.pricePerM2.point).toBeLessThanOrEqual(r.pricePerM2.high);
    expect(r.value.point).toBe(r.pricePerM2.point * 90);
    expect(r.comparablesUsed).toHaveLength(4);
  });
  it("discounts asking prices and adjusts unrenovated comps upward", () => {
    const r = estimateValue({
      areaM2: 100,
      targetCondition: "renovated",
      analysisDate: "2026-01-15",
      comparables: [comp({ id: "ask", type: "asking", price: 300_000 }), comp({ id: "unren", condition: "unrenovated", price: 240_000 })],
    });
    const ask = r.comparablesUsed.find((c) => c.id === "ask")!;
    const unren = r.comparablesUsed.find((c) => c.id === "unren")!;
    expect(ask.adjustedPricePerM2).toBe(2_850);
    expect(unren.adjustedPricePerM2).toBeGreaterThan(unren.rawPricePerM2);
  });
  it("rejects far and stale comparables with reasons", () => {
    const r = estimateValue({
      areaM2: 100,
      targetCondition: "renovated",
      analysisDate: "2026-01-15",
      comparables: [comp({ id: "far", distanceM: 5_000 }), comp({ id: "old", date: "2023-01-01" }), comp({ id: "ok" })],
    });
    expect(r.comparablesRejected.map((x) => x.id).sort()).toEqual(["far", "old"]);
    expect(r.comparablesUsed).toHaveLength(1);
  });
  it("returns UNKNOWN with zero confidence when nothing usable", () => {
    const r = estimateValue({ areaM2: 100, targetCondition: "renovated", analysisDate: "2026-01-15", comparables: [] });
    expect(r.status).toBe("UNKNOWN");
    expect(r.confidence.score).toBe(0);
  });
  it("confidence explains its factors", () => {
    const r = estimateValue({ areaM2: 100, targetCondition: "renovated", analysisDate: "2026-01-15", comparables: [comp({ id: "a" }), comp({ id: "b" })] });
    expect(r.confidence.factors.length).toBeGreaterThanOrEqual(4);
    expect(r.confidence.explanation).toContain("Mediana");
  });
});
