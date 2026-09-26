import { describe, expect, it } from "vitest";
import { runAnalysis } from "@/modules/analysis/run-analysis";
import { parseIntake } from "@/modules/property/intake";
import { login, register } from "@/server/auth/service";
import { csrfTokenFor, resolveSession, revokeSession, verifyCsrf } from "@/server/auth/session";
import { ForbiddenError, NotFoundError } from "@/server/context";
import {
  createDeal,
  getDeal,
  getLatestAnalysis,
  listDeals,
  markAnalyzing,
  persistAnalysis,
} from "@/server/services/deals";
import { getInvestorDNA, saveInvestorDNA } from "@/server/services/investor";
import {
  createCustomScenario,
  getScenarioSet,
  updateScenarioBase,
  whatIf,
} from "@/server/services/scenarios";
import { createWatch, evaluateWatches, listWatches } from "@/server/services/watch";
import { pulse } from "@/server/services/alerts";
import { recordReview, listReviews } from "@/server/services/reviews";
import { runRadar } from "@/server/services/radar";
import { seedDemo, DEMO_ORG_ID } from "@/db/seed";
import { DEFAULT_INVESTOR_DNA } from "@/modules/investor/types";
import { ctxFor, getTestDb } from "@/test/db";

const d = () => getTestDb();

describe("auth", () => {
  it("registers, logs in, resolves and revokes sessions", async () => {
    const r = await register(d(), {
      email: "ana@example.com",
      name: "Ana Pérez",
      password: "correct-horse-9",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = await resolveSession(d(), r.token);
    expect(s?.userId).toBe(r.userId);
    expect(s?.role).toBe("owner");
    const bad = await login(d(), { email: "ana@example.com", password: "wrong-password-1" });
    expect(bad.ok).toBe(false);
    const good = await login(d(), { email: "ANA@example.com", password: "correct-horse-9" });
    expect(good.ok).toBe(true);
    await revokeSession(d(), r.token);
    expect(await resolveSession(d(), r.token)).toBeNull();
  });
  it("rejects weak passwords and duplicate emails", async () => {
    expect((await register(d(), { email: "b@example.com", name: "B", password: "short" })).ok).toBe(false);
    await register(d(), { email: "c@example.com", name: "C", password: "long-enough-99" });
    expect((await register(d(), { email: "c@example.com", name: "C2", password: "long-enough-99" })).ok).toBe(
      false,
    );
  });
  it("CSRF tokens are bound to the session", () => {
    const t = csrfTokenFor("ses_1", "secret");
    expect(verifyCsrf("ses_1", t, "secret")).toBe(true);
    expect(verifyCsrf("ses_2", t, "secret")).toBe(false);
    expect(verifyCsrf("ses_1", undefined, "secret")).toBe(false);
  });
});

describe("deals, analysis persistence and tenant isolation", () => {
  it("persists an analysis and isolates tenants", async () => {
    const a = await register(d(), { email: "org-a@example.com", name: "Org A", password: "password-a-123" });
    const b = await register(d(), { email: "org-b@example.com", name: "Org B", password: "password-b-123" });
    if (!a.ok || !b.ok) throw new Error("register failed");
    const ctxA = ctxFor(a.organizationId, a.userId);
    const ctxB = ctxFor(b.organizationId, b.userId);
    const intake = parseIntake(
      "Analiza Calle Pureza 45, Triana, 95 m2, 3 habitaciones, para reformar por 255.000 €",
    );
    const deal = await createDeal(ctxA, intake);
    const analysisId = await markAnalyzing(ctxA, deal.id);
    const result = await runAnalysis({
      intake,
      organizationId: a.organizationId,
      userId: a.userId,
      dealId: deal.id,
      analysisDate: "2026-01-15",
    });
    await persistAnalysis(ctxA, analysisId, deal.id, result);
    const stored = await getLatestAnalysis(ctxA, deal.id);
    expect(stored?.strategies.length).toBeGreaterThan(2);
    expect((await getDeal(ctxA, deal.id)).status).toBe("analyzed");
    expect((await listDeals(ctxA)).map((x) => x.id)).toContain(deal.id);
    // Tenant B cannot see or touch A's deal.
    expect((await listDeals(ctxB)).map((x) => x.id)).not.toContain(deal.id);
    await expect(getDeal(ctxB, deal.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getScenarioSet(ctxB, deal.id, "flip_light")).rejects.toBeInstanceOf(NotFoundError);
    // Viewer role cannot create deals.
    await expect(createDeal(ctxFor(a.organizationId, a.userId, "viewer"), intake)).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    // Digital twin: update base recomputes; custom scenario preserved; what-if does not persist.
    const top = stored!.strategies[0]!.id;
    const set0 = await getScenarioSet(ctxA, deal.id, top);
    const custom = await createCustomScenario(ctxA, deal.id, top, "Prueba", {
      "holding.durationMonths": set0.base.holding.durationMonths + 1,
    });
    expect(custom.scenarios.some((s) => s.kind === "custom")).toBe(true);
    const { set: updated, report } = await updateScenarioBase(ctxA, deal.id, top, {
      "transformation.renovationBudget": set0.base.transformation.renovationBudget + 5_000,
    });
    expect(updated.version).toBe(custom.version + 1);
    expect(report.recomputed.length).toBeGreaterThan(0);
    const wi = await whatIf(ctxA, deal.id, top, { "acquisition.purchasePrice": 200_000 });
    expect(wi.result.metrics.netProfit.value).not.toBeNull();
    expect((await getScenarioSet(ctxA, deal.id, top)).version).toBe(updated.version);

    // Reviews and passport-level verification.
    await recordReview(ctxA, {
      dealId: deal.id,
      analysisId,
      role: "architect",
      scope: "urbanismo",
      status: "approved",
      comments: "OK",
    });
    expect((await listReviews(ctxA, deal.id))[0]?.version).toBe(1);
    expect(await listReviews(ctxB, deal.id)).toHaveLength(0);
  }, 60_000);

  it("investor DNA is per user and validated", async () => {
    const r = await register(d(), { email: "dna@example.com", name: "DNA", password: "password-dna-1" });
    if (!r.ok) throw new Error("register failed");
    const ctx = ctxFor(r.organizationId, r.userId);
    expect((await getInvestorDNA(ctx)).completed).toBe(false);
    await saveInvestorDNA(ctx, { ...DEFAULT_INVESTOR_DNA, capitalAvailable: 500_000 });
    const { dna, completed } = await getInvestorDNA(ctx);
    expect(completed).toBe(true);
    expect(dna.capitalAvailable).toBe(500_000);
    await expect(saveInvestorDNA(ctx, { ...DEFAULT_INVESTOR_DNA, horizonMonths: 0 })).rejects.toThrow();
  });
});

describe("seed, radar, watch and pulse", () => {
  it("seeds the demo and powers radar + watchers", async () => {
    const s = await seedDemo(d(), {
      withAnalyses: false,
      email: "seed@example.com",
      password: "seed-password-1",
    });
    expect(s.organizationId).toBe(DEMO_ORG_ID);
    const ctx = ctxFor(s.organizationId, s.userId);
    const { dna } = await getInvestorDNA(ctx);
    const hits = await runRadar(ctx, dna, { includeNonMatching: true });
    expect(hits.length).toBe(24);
    const matching = hits.filter((h) => h.underwriting.meetsCriteria);
    expect(matching.length).toBeGreaterThan(0);
    const watched = hits[0]!.listing;
    await createWatch(ctx, {
      listingId: watched.id,
      label: "test",
      rules: [{ kind: "meets_criteria" }, { kind: "price_below", value: watched.askingPrice + 1 }],
    });
    expect((await listWatches(ctx)).length).toBe(1);
    const ev = await evaluateWatches(ctx);
    expect(ev.evaluated).toBe(1);
    expect(ev.triggered).toBe(1);
    const p = await pulse(ctx);
    expect(p.unreadAlerts).toBeGreaterThan(0);
    expect(p.lines.length).toBeGreaterThan(0);
  }, 60_000);
});
