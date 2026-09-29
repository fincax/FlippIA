import { describe, expect, it } from "vitest";
import { runAnalysis } from "@/modules/analysis/run-analysis";
import { parseIntake } from "@/modules/property/intake";
import { askProperty, parseWhatIf } from "./ask";
import { routeCommand } from "./router";

describe("LIA router", () => {
  it("routes addresses to analysis and capital to radar", () => {
    expect(routeCommand("Calle Pureza 45, Triana").kind).toBe("analyze");
    expect(routeCommand("Tengo 250.000 €. Encuentra algo.").kind).toBe("radar");
    expect(routeCommand("hola").kind).toBe("clarify");
  });

  it("routes a spoken project to the radar and says what it will look for", () => {
    const a = routeCommand("Busco un local en Triana de hasta 200.000 € para convertirlo en vivienda");
    expect(a.kind).toBe("radar");
    expect(a.message).toContain("Triana");
    expect(a.message).toContain("cambio de uso");
    expect(routeCommand("Analiza este local de Triana por 285.000 €").kind).toBe("analyze");
  });
});

describe("Ask this property", () => {
  const intake = parseIntake(
    "Analiza Calle Pureza 45, Triana, 95 m2, 3 habitaciones, para reformar por 285.000 €",
  );
  const analysisP = runAnalysis({ intake, organizationId: "o", userId: "u", analysisDate: "2026-01-15" });

  it("answers the worst-case question from risk data", async () => {
    const a = await askProperty(await analysisP, "¿Qué es lo peor de esta inversión?");
    expect(a.kind).toBe("worst");
    expect(a.source).toBe("engine");
    expect(a.text.length).toBeGreaterThan(40);
  });
  it("explains the ARV with methodology", async () => {
    const a = await askProperty(await analysisP, "¿Por qué consideras razonable ese ARV?");
    expect(a.kind).toBe("arv");
    expect(a.text).toContain("comparables");
  });
  it("runs a what-if without mutating the base", async () => {
    const analysis = await analysisP;
    const before = JSON.stringify(analysis.strategies[0]!.scenarioSet.base);
    const a = await askProperty(analysis, "¿Qué pasa si la reforma cuesta 15.000 € más?");
    expect(a.kind).toBe("what_if");
    expect(a.text).toContain("beneficio neto");
    expect(JSON.stringify(analysis.strategies[0]!.scenarioSet.base)).toBe(before);
  });
  it("computes the maximum price", async () => {
    const a = await askProperty(await analysisP, "¿Hasta cuánto puedo pagar?");
    expect(a.kind).toBe("max_price");
    expect(a.data?.result).toBeDefined();
  });
  it("cites regulation with dates", async () => {
    const a = await askProperty(await analysisP, "¿Qué normativa afecta a la licencia?");
    expect(a.kind).toBe("regulation");
    expect(a.text).toContain("vigente");
  });
  it("parses what-if variants", async () => {
    const t = (await analysisP).strategies[0]!;
    expect(parseWhatIf("¿Y si vendo seis meses después?", t)).toBeNull(); // words not digits: not parsed, by design
    expect(parseWhatIf("¿Y si vendo 6 meses después?", t)?.overrides["holding.durationMonths"]).toBe(
      t.scenarioSet.base.holding.durationMonths + 6,
    );
    expect(parseWhatIf("¿Qué pasa si pago 20.000 € más?", t)?.overrides["acquisition.purchasePrice"]).toBe(
      t.scenarioSet.base.acquisition.purchasePrice + 20_000,
    );
  });
});
