import { describe, expect, it } from "vitest";
import { parseIntake, parseMoney } from "./intake";

describe("parseMoney", () => {
  it("parses Spanish thousands separators and suffixes", () => {
    expect(parseMoney("por 285.000 €")).toEqual([285_000]);
    expect(parseMoney("tengo 300k")).toEqual([300_000]);
    expect(parseMoney("120 mil euros")).toEqual([120_000]);
    expect(parseMoney("250000 eur")).toEqual([250_000]);
  });
});

describe("parseIntake", () => {
  it("detects an address analysis", () => {
    const r = parseIntake("Analiza Calle Pureza 45, Triana, 3º, 95 m2 para reformar por 285.000 €");
    expect(r.intent).toBe("analyze_property");
    expect(r.property?.address).toContain("Calle Pureza 45");
    expect(r.property?.areaM2).toBe(95);
    expect(r.property?.floor).toBe(3);
    expect(r.property?.condition).toBe("to_renovate");
    expect(r.price).toBe(285_000);
  });
  it("detects a premises by keyword with a neighbourhood", () => {
    const r = parseIntake("Analiza este local de Triana por 285.000 €");
    expect(r.intent).toBe("analyze_property");
    expect(r.property?.typology).toBe("premises");
    expect(r.property?.assetUse).toBe("commercial");
    expect(r.property?.address).toBe("Triana");
    expect(r.price).toBe(285_000);
  });
  it("detects a cadastral reference", () => {
    const r = parseIntake("4123456TG3442S0003XY");
    expect(r.intent).toBe("analyze_property");
    expect(r.property?.cadastralRef).toBe("4123456TG3442S0003XY");
  });
  it("detects coordinates and urls", () => {
    expect(parseIntake("37.3839, -6.0055").property?.coordinates).toEqual({ lat: 37.3839, lng: -6.0055 });
    expect(parseIntake("https://example.com/listing/123").property?.url).toBe("https://example.com/listing/123");
  });
  it("parses reverse investing", () => {
    const r = parseIntake("Tengo 300.000 €. Quiero aportar máximo 120.000 €. Sevilla. Horizonte inferior a 12 meses. Quiero estudiar operaciones con 40.000 € de potencial.");
    expect(r.intent).toBe("capital_available");
    expect(r.investor?.capital).toBe(300_000);
    expect(r.investor?.maxEquity).toBe(120_000);
    expect(r.investor?.horizonMonths).toBe(12);
    expect(r.investor?.targetProfit).toBe(40_000);
  });
  it("parses 'Tengo 250.000 €. Encuentra algo.'", () => {
    const r = parseIntake("Tengo 250.000 €. Encuentra algo.");
    expect(r.intent).toBe("capital_available");
    expect(r.investor?.capital).toBe(250_000);
  });
  it("detects what-if and questions", () => {
    expect(parseIntake("¿Qué pasa si la reforma cuesta 15.000 € más?").intent).toBe("what_if");
    expect(parseIntake("¿Qué es lo peor de esta inversión?").intent).toBe("question");
  });
});
