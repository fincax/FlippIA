import { describe, expect, it } from "vitest";
import { estimateRenovation, quantitiesFor } from "./estimate";

describe("construction estimate", () => {
  it("scales with area and level", () => {
    const cosmetic = estimateRenovation({ areaM2: 80, level: "cosmetic", bathrooms: 1, bedrooms: 2 });
    const integral = estimateRenovation({ areaM2: 80, level: "integral", bathrooms: 1, bedrooms: 2 });
    const bigger = estimateRenovation({ areaM2: 120, level: "integral", bathrooms: 2, bedrooms: 3 });
    expect(cosmetic.contractBudget).toBeLessThan(integral.contractBudget);
    expect(integral.contractBudget).toBeLessThan(bigger.contractBudget);
  });
  it("every line has quantity, unit, unit cost, subtotal, source, confidence and timestamp", () => {
    const e = estimateRenovation({ areaM2: 90, level: "medium", bathrooms: 1, bedrooms: 3 });
    for (const l of e.lines) {
      expect(l.subtotal).toBeCloseTo(l.quantity * l.unitCost, 1);
      expect(l.source).toContain("demo");
      expect(l.confidence).toBeGreaterThan(0);
      expect(l.updatedAt).toBeTruthy();
      expect(l.stage).toBe("estimate");
    }
    expect(e.status).toBe("INFERRED");
    expect(e.byChapter.reduce((a, c) => a + c.amount, 0)).toBeCloseTo(e.materialBudget, 1);
  });
  it("integral renovation of a 90 m² flat lands in a plausible €/m² band", () => {
    const e = estimateRenovation({ areaM2: 90, level: "integral", bathrooms: 1, bedrooms: 3 });
    expect(e.costPerM2).toBeGreaterThan(500);
    expect(e.costPerM2).toBeLessThan(1_300);
  });
  it("scope switches add lines", () => {
    const base = quantitiesFor({ areaM2: 80, level: "medium", bathrooms: 1, bedrooms: 2 });
    const withScope = quantitiesFor({ areaM2: 80, level: "medium", bathrooms: 1, bedrooms: 2, scope: { accessibility: true, fireSafety: true } });
    expect(withScope.length).toBe(base.length + 2);
  });
});
