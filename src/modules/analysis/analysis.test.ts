import { describe, expect, it } from "vitest";
import { parseIntake } from "@/modules/property/intake";
import type { AnalysisEvent } from "@/modules/agents/runtime/types";
import { computeFinancials } from "@/modules/engines/financial";
import { applyOverrides } from "@/modules/engines/scenario";
import { compatibleImprovements, discoverPotential, type MagicImprovement } from "./magic";
import { NotCoveredError } from "./errors";
import { runAnalysis } from "./run-analysis";

describe("runAnalysis — vertical slice", () => {
  it("turns a Triana address into an investment thesis with multiple futures", async () => {
    const events: AnalysisEvent[] = [];
    const intake = parseIntake(
      "Analiza Calle Pureza 45, Triana, 95 m2, 3 habitaciones, para reformar por 285.000 €",
    );
    const result = await runAnalysis({
      intake,
      organizationId: "org_test",
      userId: "usr_test",
      analysisDate: "2026-01-15",
      emit: (e) => events.push(e),
    });
    expect(result.failedAgents).toEqual([]);
    expect(result.property.microzone.id).toBe("sev-triana");
    expect(result.property.askingPrice).toBe(285_000);
    expect(result.strategies.length).toBeGreaterThanOrEqual(3);
    expect(result.strategies[0]!.rank).toBe(1);
    expect(result.strategies.every((s) => s.scenarioSet.scenarios.length === 4)).toBe(true);
    expect(result.strategies.every((s) => s.stress && s.maxPrice)).toBe(true);
    expect(result.synthesis.headline).toContain("posibles futuros");
    expect(result.synthesis.narrativeSource).toBe("template");
    expect(result.regulatory.entries.length).toBeGreaterThan(5);
    expect(result.evidence.length).toBeGreaterThan(10);
    expect(result.demo).toBe(true);
    expect(result.dna.dimensions).toHaveLength(9);
    expect(result.gap.gap).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "task.completed" && e.task === "market.valuation")).toBe(true);
    expect(events.at(-1)?.type).toBe("run.completed");
    expect(result.agentRuns.length).toBeGreaterThan(15);
  }, 30_000);

  it("handles a commercial premises with a conditional change-of-use future", async () => {
    const intake = parseIntake("Analiza este local de Triana de 110 m2 por 185.000 €");
    const result = await runAnalysis({
      intake,
      organizationId: "org_test",
      userId: "usr_test",
      analysisDate: "2026-01-15",
    });
    expect(result.property.property.assetUse).toBe("commercial");
    const cou = result.strategies.find((s) => s.id === "change_of_use");
    expect(cou).toBeDefined();
    expect(cou!.applicability.conditional).toBe(true);
    expect(cou!.applicability.requiredChecks.some((c) => c.blocking)).toBe(true);
    expect(result.risk.findings.some((f) => f.agent === "regulatory_conflict")).toBe(true);
    expect(result.agentRuns.find((r) => r.agentType === "urbanism.tourism")).toBeUndefined();
  }, 30_000);

  it("works with an address only (no price) and flags missing data", async () => {
    const intake = parseIntake("Calle Asunción 20, Los Remedios");
    const result = await runAnalysis({
      intake,
      organizationId: "org_test",
      userId: "usr_test",
      analysisDate: "2026-01-15",
    });
    expect(result.property.askingPriceSource).toBe("estimated");
    expect(result.synthesis.missingData).toContain("Precio de compra real.");
    expect(result.risk.findings.some((f) => f.title === "Sin precio de compra")).toBe(true);
  }, 30_000);
});

describe("discoverPotential — improvements are reproducible overrides", () => {
  const improvement = (key: string, overrides: MagicImprovement["overrides"]): MagicImprovement => ({
    key,
    strategyId: "s",
    strategyLabel: "s",
    lever: "financing",
    title: key,
    detail: "",
    deltaProfit: 0,
    deltaRoe: null,
    equityAfter: null,
    conditions: [],
    overrides,
    status: "INFERRED",
  });

  it("keeps only one of several improvements that override the same path", () => {
    const kept = compatibleImprovements([
      improvement("stack-a", { financing: [] }),
      improvement("price", { "acquisition.purchasePrice": 1 }),
      improvement("stack-b", { financing: [] }),
      improvement("empty", {}),
      improvement("timeline", { "holding.durationMonths": 5 }),
      improvement("exit", { "holding.durationMonths": 6, exit: { kind: "sale" } as never }),
    ]);
    expect(kept.map((i) => i.key)).toEqual(["stack-a", "price", "timeline"]);
  });

  it("every capital-stack improvement carries the stack as an override and reproduces its numbers", async () => {
    const intake = parseIntake(
      "Analiza Calle Pureza 45, Triana, 95 m2, 3 habitaciones, para reformar por 285.000 €",
    );
    const result = await runAnalysis({
      intake,
      organizationId: "org_test",
      userId: "usr_test",
      analysisDate: "2026-01-15",
    });
    // A permissive investor so alternative stacks are not filtered out by the equity cap.
    const report = discoverPotential(result, { ...result.investor, maxEquityPerDeal: 10_000_000 });
    const financing = report.improvements.filter((i) => i.lever === "financing");
    expect(financing.length).toBeGreaterThan(0);
    for (const i of financing) {
      const stackId = i.key.split(":").at(-1);
      const stack = result.finance.stacks.find((s) => s.id === stackId);
      expect(Array.isArray(i.overrides.financing)).toBe(true);
      expect(i.overrides.financing).toEqual(stack?.instruments);
    }
    // Any non-review improvement, applied as overrides to the strategy's base, gives back its delta.
    for (const i of report.improvements.filter((x) => x.status !== "REVIEW_REQUIRED")) {
      const strategy = result.strategies.find((s) => s.id === i.strategyId)!;
      const base = strategy.scenarioSet.scenarios.find((x) => x.kind === "base")?.result;
      expect(base).not.toBeNull();
      const r = computeFinancials(applyOverrides(strategy.scenarioSet.base, i.overrides));
      const delta = (r.metrics.netProfit.value ?? 0) - (base?.metrics.netProfit.value ?? 0);
      expect(Math.abs(delta - i.deltaProfit)).toBeLessThanOrEqual(1);
      expect(r.metrics.equityRequired.value).toBe(i.equityAfter);
    }
    // The best combination never stacks two capital structures on top of each other.
    expect(report.bestCombination).not.toBeNull();
    expect((report.bestCombination?.description.match(/estructura:/gi) ?? []).length).toBeLessThanOrEqual(1);
  }, 30_000);
});

describe("runAnalysis — jurisdiction", () => {
  it("refuses an address in a municipality that is not covered instead of applying another city's planning", async () => {
    const intake = parseIntake("Analiza Calle Larga 4, Utrera, 90 m2 por 150.000 €");
    expect(intake.property?.municipality).toBe("Utrera");
    const params = { intake, organizationId: "org_test", userId: "usr_test", analysisDate: "2026-01-15" };
    await expect(runAnalysis(params)).rejects.toBeInstanceOf(NotCoveredError);
    await expect(runAnalysis(params)).rejects.toThrow(/Utrera tiene su propio planeamiento/);
  }, 30_000);
  it("analyses a covered municipality with its own jurisdiction chain and flags what its registry lacks", async () => {
    const intake = parseIntake("Analiza Calle Real 12, Dos Hermanas, 90 m2 por 180.000 €");
    const result = await runAnalysis({
      intake,
      organizationId: "org_test",
      userId: "usr_test",
      analysisDate: "2026-01-15",
    });
    expect(result.property.property.cityId).toBe("dos-hermanas");
    expect(result.property.property.address.municipality).toBe("Dos Hermanas");
    expect(result.property.microzone.id.startsWith("dh-")).toBe(true);
    expect(result.regulatory.jurisdictionChain.at(-1)?.label).toBe("Dos Hermanas");
    expect(result.regulatory.entries.map((e) => e.regulationId)).toContain("reg.es.doshermanas.pgou-2002");
    expect(result.regulatory.gaps.some((g) => g.topic === "licence" && g.note.includes("Dos Hermanas"))).toBe(
      true,
    );
    expect(result.strategies.length).toBeGreaterThan(0);
    expect(result.demo).toBe(true);
  }, 30_000);
  it("in public mode a covered city without a planning geoservice gets UNKNOWN planning, never Sevilla's layers", async () => {
    const { adapters } = await import("@/modules/adapters/registry");
    const base = adapters();
    const publicLike = {
      ...base,
      urbanism: {
        ...base.urbanism,
        mode: "public" as const,
        async isAvailable() {
          return true;
        },
        async query() {
          throw new Error("must not be called for a city without public sources");
        },
      },
    };
    const result = await runAnalysis({
      intake: parseIntake("Analiza piso en Montequinto, Dos Hermanas, 80 m2 por 160.000 €"),
      organizationId: "org_test",
      userId: "usr_test",
      adapters: publicLike,
      analysisDate: "2026-01-15",
    });
    expect(result.urbanism.planning.status).toBe("UNKNOWN");
    expect(result.urbanism.planning.notes[0]).toContain("Dos Hermanas");
    expect(result.urbanism.requiredChecks.some((c) => c.blocking)).toBe(true);
  }, 30_000);
  it("records how the microzone was matched", async () => {
    const intake = parseIntake("Analiza Calle Pureza 45, Triana, 95 m2 por 285.000 €");
    const result = await runAnalysis({
      intake,
      organizationId: "org_test",
      userId: "usr_test",
      analysisDate: "2026-01-15",
    });
    expect(result.property.microzoneMatch).toBeDefined();
    expect(["inside", "nearest", "text", "default"]).toContain(result.property.microzoneMatch);
  }, 30_000);
});

describe("runAnalysis — planning source down", () => {
  it("completes with UNKNOWN planning and review checks instead of failing", async () => {
    const { adapters } = await import("@/modules/adapters/registry");
    const { parseIntake } = await import("@/modules/property/intake");
    const { runAnalysis } = await import("./run-analysis");
    const base = adapters();
    const failing = {
      ...base,
      urbanism: {
        ...base.urbanism,
        mode: "public" as const,
        async isAvailable() {
          return false;
        },
        async query() {
          return { ok: false as const, error: { code: "SOURCE_UNAVAILABLE", message: "IDE caída" } };
        },
      },
    };
    const result = await runAnalysis({
      intake: parseIntake("Analiza Calle Pureza 45, Triana, 95 m2 por 255.000 €"),
      organizationId: "org_t",
      userId: "usr_t",
      adapters: failing,
      analysisDate: "2026-01-15",
    });
    expect(result.urbanism.planning.status).toBe("UNKNOWN");
    expect(result.urbanism.planning.zoningCode).toBe("");
    expect(result.strategies.length).toBeGreaterThan(0);
    expect(result.urbanism.requiredChecks.length).toBeGreaterThan(0);
  });
});

describe("runAnalysis — parcel with several units", () => {
  const unit = (ref: string, floor: string, area: number) => ({
    cadastralRef: ref,
    address: `CL PUREZA 45 Pl:${floor}`,
    useCode: "V",
    useLabel: "Residencial",
    builtAreaM2: area,
    yearBuilt: 1990,
    floor,
  });
  async function withParcel(text: string) {
    const { adapters } = await import("@/modules/adapters/registry");
    const base = adapters();
    const stub = {
      ...base,
      catastro: {
        ...base.catastro,
        mode: "public" as const,
        async isAvailable() {
          return true;
        },
        async query() {
          return {
            ok: true as const,
            value: {
              data: {
                cadastralRef: "4419020TG3441N",
                address: "CL PUREZA 45",
                municipality: "SEVILLA",
                province: "SEVILLA",
                coordinates: { lat: 37.384185, lng: -6.001223 },
                builtAreaM2: 255,
                yearBuilt: 1990,
                useCode: "V",
                useLabel: "Residencial",
                units: [unit("4419020TG3441N0002ZB", "00", 120), unit("4419020TG3441N0003XZ", "02", 135)],
                cadastralValue: null,
                landValue: null,
                accessLevel: "public" as const,
              },
              evidence: [],
              retrievedAt: "2026-10-01T00:00:00.000Z",
              mode: "public" as const,
            },
          };
        },
      },
    };
    return runAnalysis({
      intake: parseIntake(text),
      organizationId: "org_test",
      userId: "usr_test",
      adapters: stub,
      analysisDate: "2026-10-01",
    });
  }
  it("without floor or typology it analyses the whole building, flags it and warns in the thesis", async () => {
    const r = await withParcel("Analiza Calle Pureza 45, Sevilla por 285.000 €");
    expect(r.property.property.typology).toBe("building");
    expect(r.property.property.builtAreaM2).toBe(255);
    expect(r.property.cadastral).toMatchObject({ unitCount: 2, unitAmbiguous: true, areaBasis: "parcel" });
    expect(r.property.summary).toContain("edificio completo");
    const alert = r.risk.findings.find((f) => f.title === "Inmueble no identificado dentro de la parcela");
    expect(alert?.severity).toBe("high");
    expect(r.synthesis.thesis.startsWith("Aviso:")).toBe(true);
    expect(r.synthesis.missingData.some((m) => m.includes("Planta y puerta"))).toBe(true);
    expect(r.risk.overall).not.toBe("low");
  }, 30_000);
  it("with a floor it settles on that unit and its area", async () => {
    const r = await withParcel("Analiza piso en Calle Pureza 45, 2º, Sevilla por 285.000 €");
    expect(r.property.cadastral.unitMatched).toBe("4419020TG3441N0003XZ");
    expect(r.property.property.builtAreaM2).toBe(135);
    expect(r.property.property.typology).toBe("flat");
    expect(r.property.cadastral.unitAmbiguous).toBeUndefined();
  }, 30_000);
  it("a flat without floor or area uses the average unit, flagged", async () => {
    const r = await withParcel("Analiza piso en Calle Pureza 45, Sevilla por 285.000 €");
    expect(r.property.property.typology).toBe("flat");
    expect(r.property.property.builtAreaM2).toBe(128);
    expect(r.property.cadastral).toMatchObject({ unitAmbiguous: true, areaBasis: "average" });
    expect(r.property.summary).toContain("superficie media");
  }, 30_000);
  it("flags an out-of-range result instead of celebrating it", async () => {
    const r = await withParcel("Analiza piso de 95 m2 en Calle Pureza 45, Sevilla por 60.000 €");
    const titles = r.risk.findings.filter((f) => f.severity === "high").map((f) => f.title);
    expect(titles).toContain("Resultado fuera de rango");
    expect(titles).toContain("Precio incompatible con el valor de la zona");
    expect(r.synthesis.thesis).toContain("no son operativas");
    expect(r.synthesis.thesis).not.toContain("ROE anualizado");
  }, 30_000);
});
