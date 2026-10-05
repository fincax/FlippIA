import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activities, deals } from "@/db/schema";
import { runAnalysis } from "@/modules/analysis/run-analysis";
import { parseIntake } from "@/modules/property/intake";
import { register } from "@/server/auth/service";
import { ForbiddenError, NotFoundError } from "@/server/context";
import {
  createDeal,
  getDeal,
  getLatestAnalysis,
  getStoredAnalysis,
  markAnalyzing,
  persistAnalysis,
} from "@/server/services/deals";
import {
  professionalInputsView,
  revertProfessionalInput,
  setProfessionalInput,
} from "@/server/services/inputs";
import {
  getEffectiveScenarioSet,
  getScenarioSet,
  updateScenarioBase,
  whatIf,
} from "@/server/services/scenarios";
import { ctxFor, getTestDb } from "@/test/db";

const d = () => getTestDb();

describe("professional inputs — persistence, precedence, audit, permissions", () => {
  it("keeps the estimate, uses the professional value, survives reload and re-analysis, reverts cleanly", async () => {
    const a = await register(d(), { email: "pro@example.com", name: "Manuel", password: "password-pro-123" });
    if (!a.ok) throw new Error("register failed");
    const ctx = ctxFor(a.organizationId, a.userId);
    const viewer = ctxFor(a.organizationId, a.userId, "viewer");
    const intake = parseIntake(
      "Analiza Calle Pureza 45, Triana, 95 m2, 3 habitaciones, para reformar por 245.000 €",
    );
    const deal = await createDeal(ctx, intake);
    const analysisId = await markAnalyzing(ctx, deal.id);
    const result = await runAnalysis({
      intake,
      organizationId: a.organizationId,
      userId: a.userId,
      dealId: deal.id,
      analysisDate: "2026-01-15",
    });
    await persistAnalysis(ctx, analysisId, deal.id, result);
    const stored0 = (await getLatestAnalysis(ctx, deal.id))!;
    const top = stored0.strategies[0]!.id;
    expect(stored0.strategies[0]!.scenarioSet.base.acquisition.purchasePrice).toBe(245_000);
    const profitBefore = stored0.strategies[0]!.headline.netProfit!;

    // TEST 10: a viewer cannot enter professional data.
    await expect(
      setProfessionalInput(viewer, deal.id, {
        key: "acquisition.purchasePrice",
        value: 218_000,
        sourceType: "professional_confirmed",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Set the negotiated price (deal-wide).
    const change = await setProfessionalInput(ctx, deal.id, {
      key: "acquisition.purchasePrice",
      value: 218_000,
      sourceType: "professional_confirmed",
      reason: "Precio negociado directamente con el vendedor",
    });
    expect(change.estimate).toEqual({ value: 245_000, source: "user" });
    expect(change.applied).toBe(stored0.strategies.length);
    expect(change.rejected).toEqual([]);
    expect(change.input).toMatchObject({ enteredBy: a.userId, enteredByName: "Manuel", state: "active" });

    // TEST 9: reload → the effective analysis uses 218.000 €; the stored analysis still holds 245.000 €.
    const effective = (await getLatestAnalysis(ctx, deal.id))!;
    expect(effective.strategies.every((s) => s.scenarioSet.base.acquisition.purchasePrice === 218_000)).toBe(
      true,
    );
    expect(effective.strategies.find((s) => s.id === top)!.headline.netProfit).toBeGreaterThan(profitBefore);
    const pristine = (await getStoredAnalysis(ctx, deal.id))!;
    expect(pristine.strategies.every((s) => s.scenarioSet.base.acquisition.purchasePrice === 245_000)).toBe(
      true,
    );
    const row = await getDeal(ctx, deal.id);
    expect(row.professionalInputs).toHaveLength(1);
    expect(row.askingPrice).toBe(245_000);
    expect((row.summary as { netProfit: number }).netProfit).toBe(
      effective.strategies[0]!.headline.netProfit,
    );

    // The twin readers see the professional value; the stored twin does not change.
    expect((await getEffectiveScenarioSet(ctx, deal.id, top)).base.acquisition.purchasePrice).toBe(218_000);
    expect((await getScenarioSet(ctx, deal.id, top)).base.acquisition.purchasePrice).toBe(245_000);
    const wi = await whatIf(ctx, deal.id, top, { "transformation.renovationBudget": 1_000 });
    expect(wi.inputs.acquisition.purchasePrice).toBe(218_000);
    // A twin hypothesis on a governed path is refused instead of silently masked.
    await expect(
      updateScenarioBase(ctx, deal.id, top, { "acquisition.purchasePrice": 230_000 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Other paths still work on the twin.
    const { set: twin } = await updateScenarioBase(ctx, deal.id, top, { "holding.durationMonths": 12 });
    expect(twin.base.holding.durationMonths).toBe(12);

    // View model for the UI.
    const view = await professionalInputsView(ctx, deal.id, pristine);
    const price = view.items.find((i) => i.key === "acquisition.purchasePrice")!;
    expect(price.estimate?.value).toBe(245_000);
    expect(price.active?.value).toBe(218_000);
    expect(price.effective).toEqual({ value: 218_000, source: "professional" });
    expect(view.maxPrice?.headroom).toBe(view.maxPrice!.maximumPrice - 218_000);
    const works = view.items.filter((i) => i.key === "transformation.renovationBudget");
    expect(works.length).toBe(pristine.strategies.length);
    expect(works.every((w) => w.effective.source === "estimate")).toBe(true);

    // Strategy-scoped works budget; unknown strategy refused.
    await expect(
      setProfessionalInput(ctx, deal.id, {
        key: "transformation.renovationBudget",
        strategyId: "no_such",
        value: 65_000,
        sourceType: "contractor_quote",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await setProfessionalInput(ctx, deal.id, {
      key: "transformation.renovationBudget",
      strategyId: top,
      value: 65_000,
      sourceType: "contractor_quote",
      breakdown: [
        { label: "Materiales", amount: 37_000 },
        { label: "Mano de obra", amount: 28_000 },
      ],
    });
    const both = (await getLatestAnalysis(ctx, deal.id))!;
    expect(both.strategies.find((s) => s.id === top)!.scenarioSet.base.transformation.renovationBudget).toBe(
      65_000,
    );

    // Re-analysis: scenario sets are rebuilt, the professional inputs stay and apply again.
    const analysisId2 = await markAnalyzing(ctx, deal.id);
    const result2 = await runAnalysis({
      intake,
      organizationId: a.organizationId,
      userId: a.userId,
      dealId: deal.id,
      analysisDate: "2026-01-16",
    });
    await persistAnalysis(ctx, analysisId2, deal.id, result2);
    const after = (await getLatestAnalysis(ctx, deal.id))!;
    expect(after.id).toBe(analysisId2);
    expect(after.strategies.every((s) => s.scenarioSet.base.acquisition.purchasePrice === 218_000)).toBe(
      true,
    );
    expect((await getDeal(ctx, deal.id)).professionalInputs.filter((i) => i.state === "active")).toHaveLength(
      2,
    );

    // Supersede: the first entry is kept as history.
    await setProfessionalInput(ctx, deal.id, {
      key: "acquisition.purchasePrice",
      value: 215_000,
      sourceType: "document_verified",
      reason: "Arras firmadas",
    });
    const list = (await getDeal(ctx, deal.id)).professionalInputs;
    expect(list.filter((i) => i.key === "acquisition.purchasePrice").map((i) => i.state)).toEqual([
      "superseded",
      "active",
    ]);
    expect(
      (await getLatestAnalysis(ctx, deal.id))!.strategies[0]!.scenarioSet.base.acquisition.purchasePrice,
    ).toBe(215_000);

    // Revert → effective returns to the estimate; nothing is deleted.
    await expect(
      revertProfessionalInput(viewer, deal.id, { key: "acquisition.purchasePrice" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await revertProfessionalInput(ctx, deal.id, {
      key: "acquisition.purchasePrice",
      reason: "Operación caída",
    });
    const reverted = (await getLatestAnalysis(ctx, deal.id))!;
    expect(reverted.strategies.every((s) => s.scenarioSet.base.acquisition.purchasePrice === 245_000)).toBe(
      true,
    );
    expect(
      reverted.strategies.find((s) => s.id === top)!.scenarioSet.base.transformation.renovationBudget,
    ).toBe(65_000);
    const history = (await getDeal(ctx, deal.id)).professionalInputs;
    expect(history).toHaveLength(3);
    expect(history.filter((i) => i.state === "reverted")).toHaveLength(1);
    await expect(
      revertProfessionalInput(ctx, deal.id, { key: "acquisition.purchasePrice" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Audit trail: value before / after, who, reason.
    const trail = await d().select().from(activities).where(eq(activities.dealId, deal.id));
    const sets = trail.filter((t) => t.kind === "input.professional_set");
    const reverts = trail.filter((t) => t.kind === "input.professional_reverted");
    expect(sets).toHaveLength(3);
    expect(reverts).toHaveLength(1);
    const first = sets.find(
      (t) => (t.payload as { key: string; before: { value: number } }).before.value === 245_000,
    )!;
    expect(first.userId).toBe(a.userId);
    expect(first.payload).toMatchObject({
      key: "acquisition.purchasePrice",
      after: { value: 218_000, sourceType: "professional_confirmed" },
      reason: "Precio negociado directamente con el vendedor",
    });
    expect(reverts[0]!.payload).toMatchObject({ before: { value: 215_000 }, reason: "Operación caída" });

    // Tenant isolation.
    const b = await register(d(), { email: "other@example.com", name: "Otra", password: "password-oth-123" });
    if (!b.ok) throw new Error("register failed");
    await expect(
      setProfessionalInput(ctxFor(b.organizationId, b.userId), deal.id, {
        key: "acquisition.purchasePrice",
        value: 1_000,
        sourceType: "actual",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const [rowB] = await d().select().from(deals).where(eq(deals.id, deal.id));
    expect(rowB!.professionalInputs).toHaveLength(3);
  }, 120_000);
});
