import { describe, expect, it } from "vitest";
import { runAnalysis } from "@/modules/analysis/run-analysis";
import type { AnalysisResult } from "@/modules/analysis/types";
import { addCustomScenario, updateBase } from "@/modules/engines/scenario";
import { askProperty } from "@/modules/lia/ask";
import { parseIntake } from "@/modules/property/intake";
import {
  activeInputs,
  applyToAnalysis,
  applyToScenarioSet,
  newProfessionalInput,
  pickProfessionalInput,
  professionalInputRevertSchema,
  professionalInputSetSchema,
  provenanceNote,
  resolveEffectiveValue,
  revertProfessionalInput,
  setProfessionalInput,
  type ProfessionalInput,
} from "./index";

const ENTERED_AT = new Date("2026-10-05T10:00:00Z");

const analysisP = runAnalysis({
  intake: parseIntake("Analiza Calle Pureza 45, Triana, 95 m2, 3 habitaciones, para reformar por 285.000 €"),
  organizationId: "org_test",
  userId: "usr_test",
  analysisDate: "2026-01-15",
});

function negotiated(over: Partial<Parameters<typeof newProfessionalInput>[0]> = {}, at = ENTERED_AT) {
  return newProfessionalInput(
    {
      key: "acquisition.purchasePrice",
      value: 218_000,
      sourceType: "professional_confirmed",
      enteredBy: "usr_manuel",
      enteredByName: "Manuel",
      reason: "Precio negociado directamente con el vendedor",
      ...over,
    },
    at,
  );
}

const topOf = (a: AnalysisResult) => a.strategies.find((s) => s.rank === 1) ?? a.strategies[0]!;
const baseOf = (a: AnalysisResult, id: string) =>
  a.strategies.find((s) => s.id === id)!.scenarioSet.scenarios.find((x) => x.kind === "base")!.result!;

describe("precedence — resolveEffectiveValue", () => {
  it("falls back to the estimate, then to the twin's manual assumption, and a professional input wins", () => {
    expect(resolveEffectiveValue({ inputs: [], key: "acquisition.purchasePrice" })).toEqual({
      value: undefined,
      source: "unknown",
    });
    expect(
      resolveEffectiveValue({
        inputs: [],
        key: "acquisition.purchasePrice",
        fallback: { value: 245_000, source: "estimate" },
      }),
    ).toMatchObject({ value: 245_000, source: "estimate" });
    expect(
      resolveEffectiveValue({
        inputs: [],
        key: "acquisition.purchasePrice",
        fallback: { value: 230_000, source: "manual_assumption" },
      }),
    ).toMatchObject({ value: 230_000, source: "manual_assumption" });
    const r = resolveEffectiveValue({
      inputs: [negotiated()],
      key: "acquisition.purchasePrice",
      fallback: { value: 230_000, source: "manual_assumption" },
    });
    expect(r.value).toBe(218_000);
    expect(r.source).toBe("professional");
    expect(r.input?.enteredBy).toBe("usr_manuel");
  });

  it("ranks source types (actual › document › accepted quote › quote › confirmed) and then recency", () => {
    const older = negotiated({ value: 215_000, sourceType: "actual" }, new Date("2026-09-01T00:00:00Z"));
    const newer = negotiated({ value: 218_000, sourceType: "professional_confirmed" });
    expect(pickProfessionalInput([newer, older], "acquisition.purchasePrice")?.value).toBe(215_000);
    const sameRankOld = negotiated({ value: 220_000 }, new Date("2026-09-01T00:00:00Z"));
    expect(pickProfessionalInput([sameRankOld, newer], "acquisition.purchasePrice")?.value).toBe(218_000);
  });

  it("ignores superseded and reverted entries and respects strategy scope", () => {
    const works = newProfessionalInput(
      {
        key: "transformation.renovationBudget",
        strategyId: "flip_integral",
        value: 65_000,
        sourceType: "contractor_quote",
        enteredBy: "usr_arch",
      },
      ENTERED_AT,
    );
    const list: ProfessionalInput[] = [{ ...negotiated(), state: "superseded" }, works];
    expect(pickProfessionalInput(list, "acquisition.purchasePrice")).toBeNull();
    expect(pickProfessionalInput(list, "transformation.renovationBudget", "flip_integral")?.value).toBe(
      65_000,
    );
    expect(pickProfessionalInput(list, "transformation.renovationBudget", "buy_hold")).toBeNull();
    // Deal-wide inputs apply to every strategy.
    expect(pickProfessionalInput([negotiated()], "acquisition.purchasePrice", "buy_hold")?.value).toBe(
      218_000,
    );
  });
});

describe("lifecycle — set, supersede, revert (no data loss)", () => {
  it("a new entry supersedes the previous one; reverting keeps the entry as history", () => {
    const first = negotiated({ value: 220_000 }, new Date("2026-09-01T00:00:00Z"));
    const { list: l1, previous: p1 } = setProfessionalInput([], first);
    expect(p1).toBeNull();
    const second = negotiated({ value: 218_000 });
    const { list: l2, previous: p2 } = setProfessionalInput(l1, second);
    expect(p2?.id).toBe(first.id);
    expect(l2).toHaveLength(2);
    expect(l2[0]).toMatchObject({ id: first.id, state: "superseded", endedBy: "usr_manuel" });
    expect(activeInputs(l2).map((i) => i.id)).toEqual([second.id]);
    const { list: l3, reverted } = revertProfessionalInput(
      l2,
      "acquisition.purchasePrice",
      undefined,
      "usr_manuel",
      "La oferta no prosperó",
      new Date("2026-10-06T00:00:00Z"),
    );
    expect(reverted?.id).toBe(second.id);
    expect(l3).toHaveLength(2);
    expect(l3[1]).toMatchObject({ state: "reverted", endedReason: "La oferta no prosperó" });
    expect(activeInputs(l3)).toEqual([]);
    expect(revertProfessionalInput(l3, "acquisition.purchasePrice", undefined, "u").reverted).toBeNull();
  });
});

describe("validation", () => {
  const ok = { key: "acquisition.purchasePrice", value: 218_000, sourceType: "professional_confirmed" };
  it("accepts a well-formed input and rejects type, range, precision, scope and breakdown errors", () => {
    expect(professionalInputSetSchema.safeParse(ok).success).toBe(true);
    expect(professionalInputSetSchema.safeParse({ ...ok, value: -1 }).success).toBe(false);
    expect(professionalInputSetSchema.safeParse({ ...ok, value: Number.NaN }).success).toBe(false);
    expect(professionalInputSetSchema.safeParse({ ...ok, value: "218000" }).success).toBe(false);
    expect(professionalInputSetSchema.safeParse({ ...ok, value: 218_000.123 }).success).toBe(false);
    expect(professionalInputSetSchema.safeParse({ ...ok, value: 1e12 }).success).toBe(false);
    expect(professionalInputSetSchema.safeParse({ ...ok, key: "exit.salePrice" }).success).toBe(false);
    expect(professionalInputSetSchema.safeParse({ ...ok, sourceType: "guess" }).success).toBe(false);
    expect(professionalInputSetSchema.safeParse({ ...ok, strategyId: "flip_light" }).success).toBe(false);
    const works = { key: "transformation.renovationBudget", value: 65_500, sourceType: "contractor_quote" };
    expect(professionalInputSetSchema.safeParse(works).success).toBe(false);
    expect(professionalInputSetSchema.safeParse({ ...works, strategyId: "flip_integral" }).success).toBe(
      true,
    );
    expect(
      professionalInputSetSchema.safeParse({
        ...works,
        strategyId: "flip_integral",
        breakdown: [
          { label: "Materiales", amount: 37_500 },
          { label: "Mano de obra", amount: 28_000 },
        ],
      }).success,
    ).toBe(true);
    expect(
      professionalInputSetSchema.safeParse({
        ...works,
        strategyId: "flip_integral",
        breakdown: [{ label: "Materiales", amount: 10_000 }],
      }).success,
    ).toBe(false);
    expect(professionalInputRevertSchema.safeParse({ key: "acquisition.purchasePrice" }).success).toBe(true);
    expect(professionalInputRevertSchema.safeParse({ key: "transformation.renovationBudget" }).success).toBe(
      false,
    );
  });
});

describe("applyToAnalysis — purchase price (TEST 1, 3, 4, 7, 8)", () => {
  it("uses 218.000 € everywhere the price matters and keeps the 285.000 € estimate intact", async () => {
    const analysis = await analysisP;
    const pristine = structuredClone(analysis);
    const input = negotiated();
    const { result: effective, applied, rejected } = applyToAnalysis(analysis, [input]);

    // TEST 8 / principle: the stored analysis is never mutated.
    expect(analysis).toEqual(pristine);
    expect(effective).not.toBe(analysis);
    expect(rejected).toEqual([]);
    expect(applied).toHaveLength(analysis.strategies.length);
    expect(applied.every((a) => a.estimate.value === 285_000)).toBe(true);
    expect(applied[0]!.input).toBe(input);

    // TEST 1: every strategy computes with the professional price; the estimate remains in the stored result.
    for (const s of effective.strategies) {
      expect(s.scenarioSet.base.acquisition.purchasePrice).toBe(218_000);
      const a = s.scenarioSet.assumptions.find((x) => x.path === "acquisition.purchasePrice")!;
      expect(a.value).toBe(218_000);
      expect(a.source).toBe("professional");
      expect(a.status).toBe("INFERRED");
      expect(a.note).toContain("285.000");
      expect(a.note).toContain("Manuel");
      expect(a.note).toContain("negociado");
    }
    expect(analysis.strategies.every((s) => s.scenarioSet.base.acquisition.purchasePrice === 285_000)).toBe(
      true,
    );

    // TEST 3: real downstream dependencies in the engine.
    const id = topOf(analysis).id;
    const before = baseOf(analysis, id);
    const after = baseOf(effective, id);
    const line = (r: typeof before, key: string) => r.costLines.find((l) => l.key === key)?.amount ?? 0;
    expect(line(after, "purchase")).toBe(218_000);
    expect(line(after, "transfer_tax")).toBeLessThan(line(before, "transfer_tax"));
    expect(line(after, "notary")).toBeLessThanOrEqual(line(before, "notary"));
    expect(after.totals.totalProjectCost).toBeLessThan(before.totals.totalProjectCost);
    expect(after.metrics.equityRequired.value!).toBeLessThan(before.metrics.equityRequired.value!);
    expect(after.metrics.netProfit.value!).toBeGreaterThan(before.metrics.netProfit.value!);
    expect(after.metrics.roe.value!).toBeGreaterThan(before.metrics.roe.value!);
    if (before.metrics.margin.value !== null)
      expect(after.metrics.margin.value!).toBeGreaterThan(before.metrics.margin.value);
    const s = effective.strategies.find((x) => x.id === id)!;
    expect(s.headline.netProfit).toBe(after.metrics.netProfit.value);
    expect(s.headline.equityRequired).toBe(after.metrics.equityRequired.value);
    expect(s.stress!.base.netProfit).toBe(after.metrics.netProfit.value);
    expect(effective.risk.stressByStrategy[id]).toBe(s.stress);
    // Maximum price stays an independent engine result; the headroom is measured against the price in use.
    expect(s.maxPrice!.askingPrice).toBe(218_000);
    expect(s.maxPrice!.headroom).toBe(s.maxPrice!.maximumPrice - 218_000);
    expect(effective.gap.levers.find((l) => l.key === "acquisition")!.amount).toBe(
      Math.round(effective.gap.currentValue - 218_000),
    );
    expect(effective.strategies.map((x) => x.rank)).toEqual(effective.strategies.map((_, i) => i + 1));
    expect(effective.synthesis.narrativeSource).toBe("template");

    // TEST 4: nothing outside the financial chain moves.
    expect(effective.property).toBe(analysis.property);
    expect(effective.market).toBe(analysis.market);
    expect(effective.urbanism).toBe(analysis.urbanism);
    expect(effective.architecture).toBe(analysis.architecture);
    expect(effective.regulatory).toBe(analysis.regulatory);
    expect(effective.finance).toBe(analysis.finance);
    expect(effective.evidence).toBe(analysis.evidence);
    expect(effective.risk.findings).toBe(analysis.risk.findings);
    expect(effective.property.askingPrice).toBe(285_000);
    expect(effective.market.valuationRenovated).toBe(analysis.market.valuationRenovated);

    // TEST 7: provenance travels with the value.
    expect(input).toMatchObject({
      enteredBy: "usr_manuel",
      enteredByName: "Manuel",
      enteredAt: ENTERED_AT.toISOString(),
      sourceType: "professional_confirmed",
      status: "INFERRED",
      state: "active",
      unit: "currency",
    });
    expect(provenanceNote(input, applied[0]!.estimate)).toContain(
      "Precio negociado directamente con el vendedor",
    );

    // Applying again over the effective result changes nothing (idempotent).
    const twice = applyToAnalysis(effective, [input]).result;
    expect(baseOf(twice, id).metrics.netProfit.value).toBe(after.metrics.netProfit.value);
  }, 30_000);

  it("TEST 2 — without active inputs the stored analysis is returned untouched (same reference)", async () => {
    const analysis = await analysisP;
    const input = negotiated();
    const { list } = revertProfessionalInput(
      setProfessionalInput([], input).list,
      "acquisition.purchasePrice",
      undefined,
      "usr_manuel",
    );
    const r = applyToAnalysis(analysis, list);
    expect(r.result).toBe(analysis);
    expect(r.applied).toEqual([]);
    expect(topOf(r.result).scenarioSet.base.acquisition.purchasePrice).toBe(285_000);
    expect(applyToAnalysis(analysis, []).result).toBe(analysis);
  }, 30_000);

  it("reports an input it cannot apply instead of ignoring it", async () => {
    const analysis = await analysisP;
    const ghost = newProfessionalInput(
      {
        key: "transformation.renovationBudget",
        strategyId: "no_such_strategy",
        value: 1_000,
        sourceType: "contractor_quote",
        enteredBy: "u",
      },
      ENTERED_AT,
    );
    const r = applyToAnalysis(analysis, [ghost]);
    expect(r.result).toBe(analysis);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]!.reason).toContain("no está en el análisis");
  }, 30_000);
});

describe("applyToAnalysis — construction cost (TEST 5)", () => {
  it("a contractor's 65.000 € replaces the estimate for that strategy only, and the economics follow", async () => {
    const analysis = await analysisP;
    const id = topOf(analysis).id;
    const estimate = analysis.strategies.find((s) => s.id === id)!.scenarioSet.base.transformation
      .renovationBudget;
    expect(estimate).toBeGreaterThan(0);
    const input = newProfessionalInput(
      {
        key: "transformation.renovationBudget",
        strategyId: id,
        value: 65_000,
        sourceType: "contractor_quote",
        enteredBy: "usr_arch",
        enteredByName: "Arquitecta",
        breakdown: [
          { label: "Materiales", amount: 37_000 },
          { label: "Mano de obra", amount: 28_000 },
        ],
      },
      ENTERED_AT,
    );
    const { result: effective, applied } = applyToAnalysis(analysis, [input]);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.estimate.value).toBe(estimate);
    const s = effective.strategies.find((x) => x.id === id)!;
    expect(s.scenarioSet.base.transformation.renovationBudget).toBe(65_000);
    expect(s.scenarioSet.assumptions.find((a) => a.path === "transformation.renovationBudget")).toMatchObject(
      {
        value: 65_000,
        source: "professional",
      },
    );
    const before = baseOf(analysis, id);
    const after = baseOf(effective, id);
    const vat = after.inputs.transformation.worksVatReduced ? 0.1 : 0.21;
    expect(after.costLines.find((l) => l.key === "construction")!.amount).toBeCloseTo(65_000 * (1 + vat), 0);
    expect(after.totals.transformation).not.toBe(before.totals.transformation);
    expect(after.metrics.netProfit.value).not.toBe(before.metrics.netProfit.value);
    expect(after.metrics.equityRequired.value).not.toBe(before.metrics.equityRequired.value);
    // The stress test departs from the professional base: +20 % on 65.000 €.
    const stress = s.scenarioSet.scenarios.find((x) => x.kind === "stress")!;
    expect(stress.inputs.transformation.renovationBudget).toBe(Math.round(65_000 * 1.2));
    expect(s.stress!.base.netProfit).toBe(after.metrics.netProfit.value);
    // Other strategies keep their own estimates (same objects).
    for (const other of effective.strategies.filter((x) => x.id !== id)) {
      const original = analysis.strategies.find((x) => x.id === other.id)!;
      expect(other.scenarioSet).toBe(original.scenarioSet);
    }
    // Estimate preserved in the stored analysis.
    expect(
      analysis.strategies.find((x) => x.id === id)!.scenarioSet.base.transformation.renovationBudget,
    ).toBe(estimate);
    expect(input.breakdown).toHaveLength(2);
  }, 30_000);
});

describe("applyToScenarioSet — scenario isolation and twin precedence (TEST 6)", () => {
  it("a custom scenario keeps its own hypothesis while the base takes the professional value", async () => {
    const analysis = await analysisP;
    const set = topOf(analysis).scenarioSet;
    const withCustom = addCustomScenario(set, "Compra 205k", { "acquisition.purchasePrice": 205_000 });
    const custom = withCustom.scenarios.find((s) => s.kind === "custom")!;
    const { result } = applyToScenarioSet(withCustom, [negotiated()]);
    expect(result.base.acquisition.purchasePrice).toBe(218_000);
    const customAfter = result.scenarios.find((s) => s.id === custom.id)!;
    expect(customAfter.inputs.acquisition.purchasePrice).toBe(205_000);
    expect(customAfter.result).toEqual(custom.result);
    const stress = result.scenarios.find((s) => s.kind === "stress")!;
    expect(stress.inputs.acquisition.purchasePrice).toBe(218_000);
    expect(result.scenarios.find((s) => s.kind === "base")!.result!.metrics.netProfit.value).not.toBe(
      set.scenarios.find((s) => s.kind === "base")!.result!.metrics.netProfit.value,
    );
    // A view, not a new persisted version.
    expect(result.version).toBe(withCustom.version);
    // The stored set is untouched.
    expect(withCustom.base.acquisition.purchasePrice).toBe(285_000);
  }, 30_000);

  it("a professional input outranks a manual assumption applied to the twin base", async () => {
    const analysis = await analysisP;
    const set = topOf(analysis).scenarioSet;
    const { set: twin } = updateBase(set, { "acquisition.purchasePrice": 230_000 });
    expect(twin.assumptions.find((a) => a.path === "acquisition.purchasePrice")?.source).toBe("user");
    const { result, applied } = applyToScenarioSet(twin, [negotiated()]);
    expect(result.base.acquisition.purchasePrice).toBe(218_000);
    expect(applied[0]!.estimate).toMatchObject({ value: 230_000, source: "user" });
    expect(applyToScenarioSet(twin, []).result).toBe(twin);
  }, 30_000);
});

describe("LIA — attributes professional data to the professional (TEST 11)", () => {
  it("says the price is the user's input, not its own estimate", async () => {
    const analysis = await analysisP;
    const effective = applyToAnalysis(analysis, [negotiated()]).result;
    const max = await askProperty(effective, "¿Hasta cuánto puedo pagar?");
    expect(max.kind).toBe("max_price");
    expect(max.text).toContain("218.000");
    expect(max.text).toContain("que has indicado");
    expect(max.text).toContain("no una estimación mía");
    const general = await askProperty(effective, "Resume la operación");
    expect(general.text).toContain("dato que has introducido");
    const pristine = await askProperty(analysis, "¿Hasta cuánto puedo pagar?");
    expect(pristine.text).toContain("solicitados");
    expect(pristine.text).not.toContain("has introducido");
  }, 30_000);
});
