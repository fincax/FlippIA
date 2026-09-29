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
  it("refuses an address in another municipality instead of applying Sevilla's planning to it", async () => {
    const intake = parseIntake("Analiza Calle Real 12, Dos Hermanas, 90 m2 por 180.000 €");
    expect(intake.property?.municipality).toBe("Dos Hermanas");
    await expect(
      runAnalysis({ intake, organizationId: "org_test", userId: "usr_test", analysisDate: "2026-01-15" }),
    ).rejects.toBeInstanceOf(NotCoveredError);
    await expect(
      runAnalysis({ intake, organizationId: "org_test", userId: "usr_test", analysisDate: "2026-01-15" }),
    ).rejects.toThrow(/Dos Hermanas tiene su propio planeamiento/);
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
