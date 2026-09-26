import { describe, expect, it } from "vitest";
import { parseIntake } from "@/modules/property/intake";
import type { AnalysisEvent } from "@/modules/agents/runtime/types";
import { runAnalysis } from "./run-analysis";

describe("runAnalysis — vertical slice", () => {
  it("turns a Triana address into an investment thesis with multiple futures", async () => {
    const events: AnalysisEvent[] = [];
    const intake = parseIntake("Analiza Calle Pureza 45, Triana, 95 m2, 3 habitaciones, para reformar por 285.000 €");
    const result = await runAnalysis({ intake, organizationId: "org_test", userId: "usr_test", analysisDate: "2026-01-15", emit: (e) => events.push(e) });
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
    const result = await runAnalysis({ intake, organizationId: "org_test", userId: "usr_test", analysisDate: "2026-01-15" });
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
    const result = await runAnalysis({ intake, organizationId: "org_test", userId: "usr_test", analysisDate: "2026-01-15" });
    expect(result.property.askingPriceSource).toBe("estimated");
    expect(result.synthesis.missingData).toContain("Precio de compra real.");
    expect(result.risk.findings.some((f) => f.title === "Sin precio de compra")).toBe(true);
  }, 30_000);
});
