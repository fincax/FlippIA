import { describe, expect, it } from "vitest";
import { parseIntake, parseMoney } from "./intake";

describe("parseMoney", () => {
  it("parses Spanish thousands separators and suffixes", () => {
    expect(parseMoney("por 285.000 €")).toEqual([285_000]);
    expect(parseMoney("tengo 300k")).toEqual([300_000]);
    expect(parseMoney("120 mil euros")).toEqual([120_000]);
    expect(parseMoney("250000 eur")).toEqual([250_000]);
  });
  it("parses millions written in Spanish or with an M suffix", () => {
    expect(parseMoney("1,5 millones")).toEqual([1_500_000]);
    expect(parseMoney("1.5M")).toEqual([1_500_000]);
    expect(parseMoney("2 millones de euros")).toEqual([2_000_000]);
    expect(parseMoney("1,2 M€")).toEqual([1_200_000]);
  });
  it("accepts the euro sign before the amount", () => {
    expect(parseMoney("€ 285.000")).toEqual([285_000]);
    expect(parseMoney("€285.000")).toEqual([285_000]);
  });
  it("does not confuse metres or areas with money", () => {
    expect(parseMoney("a 200 m del metro, 90 m2, 95 m²")).toEqual([]);
    expect(parseMoney("Calle Pureza 45, 3º")).toEqual([]);
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
    expect(parseIntake("https://example.com/listing/123").property?.url).toBe(
      "https://example.com/listing/123",
    );
  });
  it("parses reverse investing", () => {
    const r = parseIntake(
      "Tengo 300.000 €. Quiero aportar máximo 120.000 €. Sevilla. Horizonte inferior a 12 meses. Quiero estudiar operaciones con 40.000 € de potencial.",
    );
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
  it("parses a street whose name contains digits", () => {
    const r = parseIntake("Calle 10 de Diciembre 4, 90 m2, 200.000 €");
    expect(r.intent).toBe("analyze_property");
    expect(r.property?.address).toBe("Calle 10 de Diciembre 4");
    expect(r.property?.areaM2).toBe(90);
    expect(r.price).toBe(200_000);
  });
  it("parses prices in millions", () => {
    expect(parseIntake("Analiza este chalet en Nervión por 1,5 millones").price).toBe(1_500_000);
    expect(parseIntake("Analiza este chalet en Nervión por 1.5M").price).toBe(1_500_000);
  });
  it("parses the euro sign before the amount", () => {
    const r = parseIntake("Analiza Calle Betis 12, Triana, € 285.000");
    expect(r.price).toBe(285_000);
  });
  it("takes a bare number as price when preceded by precio/por/a", () => {
    expect(parseIntake("Piso en Triana de 80 m2, precio 199.000").price).toBe(199_000);
    expect(parseIntake("Analiza el piso de Calle Pureza 45 por 199.000").price).toBe(199_000);
    expect(parseIntake("Analiza el piso de Calle Pureza 45 a 199.000").price).toBe(199_000);
    // A bare number in another context is not a price.
    expect(parseIntake("Analiza Calle Pureza 45 con 3 habitaciones").price).toBeUndefined();
  });
  it("never takes a rent as the purchase price", () => {
    const r = parseIntake("Analiza este piso de Triana alquilado por 1.500 € al mes de alquiler");
    expect(r.intent).toBe("analyze_property");
    expect(r.price).toBeUndefined();
    expect(r.expectedRent).toBe(1_500);
    const both = parseIntake("Piso en Triana por 250.000 € que se alquila por 1.200 € al mes");
    expect(both.price).toBe(250_000);
    expect(both.expectedRent).toBe(1_200);
    const rentFirst = parseIntake("Piso en Triana con renta de 900 € mensuales, precio 180.000 €");
    expect(rentFirst.price).toBe(180_000);
    expect(rentFirst.expectedRent).toBe(900);
  });
  it("takes the purchase price, not the sale price, when both are mentioned", () => {
    const r = parseIntake("Compra el piso de Calle Pureza 45 por 250.000€ y vende a 340.000€");
    expect(r.intent).toBe("analyze_property");
    expect(r.price).toBe(250_000);
    const reversed = parseIntake("Analiza este piso de Triana: vende a 340.000 € tras comprar por 250.000 €");
    expect(reversed.price).toBe(250_000);
  });
  it("recognises a zone hint after an article", () => {
    const r = parseIntake("Piso de 60 m² en la Alameda");
    expect(r.intent).toBe("analyze_property");
    expect(r.property?.typology).toBe("flat");
    expect(r.property?.areaM2).toBe(60);
    expect(r.property?.address).toBe("Alameda");
  });
  it("detects what-if and questions", () => {
    expect(parseIntake("¿Qué pasa si la reforma cuesta 15.000 € más?").intent).toBe("what_if");
    expect(parseIntake("¿Qué es lo peor de esta inversión?").intent).toBe("question");
  });
});
