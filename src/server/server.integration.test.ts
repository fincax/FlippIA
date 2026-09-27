import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentRuns, organizations, sessions, users } from "@/db/schema";
import { needsRehash } from "@/server/auth/password";
import { purgeRateLimits, rateLimit } from "@/server/auth/rate-limit";
import { deleteOrganization } from "@/server/services/organization";
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
import { createWatch, evaluateAllWatches, evaluateWatches, listWatches } from "@/server/services/watch";
import { pulse } from "@/server/services/alerts";
import { recordReview, listReviews } from "@/server/services/reviews";
import { runRadar, visibleListings } from "@/server/services/radar";
import {
  addComparables,
  comparablesRepository,
  deleteComparable,
  listComparables,
  tenantAdapters,
} from "@/server/services/comparables";
import { CompositeMarketAdapter, OwnComparablesAdapter } from "@/modules/adapters/market";
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

describe("shared rate limiter, sessions and password upgrade", () => {
  it("counts requests across the database window and purges old counters", async () => {
    const key = `test:${Date.now()}`;
    const first = await rateLimit(d(), key, 2, 60_000);
    const second = await rateLimit(d(), key, 2, 60_000);
    const third = await rateLimit(d(), key, 2, 60_000);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    const later = await rateLimit(d(), key, 2, 60_000, new Date(Date.now() + 61_000));
    expect(later.allowed).toBe(true);
    await purgeRateLimits(d(), new Date(Date.now() + 3 * 86_400_000));
    const fresh = await rateLimit(d(), key, 2, 60_000);
    expect(fresh.remaining).toBe(1);
  });
  it("rehashes a legacy scrypt hash on login and slides the session expiry", async () => {
    const r = await register(d(), { email: "legacy@example.com", name: "L", password: "legacy-pass-2026" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const legacy = await scryptLegacyHash("legacy-pass-2026");
    await d().update(users).set({ passwordHash: legacy }).where(eq(users.id, r.userId));
    expect(needsRehash(legacy)).toBe(true);
    const login1 = await login(d(), { email: "legacy@example.com", password: "legacy-pass-2026" });
    expect(login1.ok).toBe(true);
    const [row] = await d().select({ hash: users.passwordHash }).from(users).where(eq(users.id, r.userId));
    expect(needsRehash(row!.hash)).toBe(false);
    if (!login1.ok) return;
    await d()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 1000) })
      .where(eq(sessions.userId, r.userId));
    const s = await resolveSession(d(), login1.token);
    expect(s?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 86_400_000);
  });
});

describe("scheduled watcher and organization deletion", () => {
  it("evaluates every organization's watches and deletes an organization with all its data", async () => {
    const r = await register(d(), { email: "owner@delete.example", name: "O", password: "owner-pass-2026" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ctx = ctxFor(r.organizationId, r.userId, "owner");
    const intake = parseIntake("Analiza Calle Betis 10, Triana, 80 m2 por 240.000 €");
    const deal = await createDeal(ctx, intake);
    const analysisId = await markAnalyzing(ctx, deal.id);
    const result = await runAnalysis({
      intake,
      organizationId: r.organizationId,
      userId: r.userId,
      dealId: deal.id,
      analysisDate: "2026-01-15",
    });
    await persistAnalysis(ctx, analysisId, deal.id, result);
    const listings = await visibleListings(ctx);
    await createWatch(ctx, {
      dealId: deal.id,
      listingId: listings[0]?.id,
      label: "cron",
      rules: [{ kind: "meets_criteria" }],
    });
    const cron = await evaluateAllWatches(d());
    expect(cron.organizations).toBeGreaterThanOrEqual(1);
    expect(cron.evaluated).toBeGreaterThanOrEqual(1);

    await expect(deleteOrganization(ctx, "wrong-slug")).rejects.toThrow(ForbiddenError);
    const [org] = await d()
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, r.organizationId));
    const out = await deleteOrganization(ctx, org!.slug);
    expect(out.deletedUsers).toBe(1);
    expect(await resolveSession(d(), r.token)).toBeNull();
    const [runs] = await d()
      .select({ n: sql<number>`count(*)::int` })
      .from(agentRuns)
      .where(eq(agentRuns.organizationId, r.organizationId));
    expect(runs?.n).toBe(0);
    expect((await d().select({ id: users.id }).from(users).where(eq(users.id, r.userId))).length).toBe(0);
  });
});

async function scryptLegacyHash(password: string): Promise<string> {
  const { randomBytes, scryptSync } = await import("node:crypto");
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

describe("own market comparables", () => {
  it("stores comparables per organisation, feeds the market adapter and never leaks across tenants", async () => {
    const a = await register(d(), { email: "cmp-a@example.com", name: "A", password: "long-enough-99" });
    const b = await register(d(), { email: "cmp-b@example.com", name: "B", password: "long-enough-99" });
    if (!a.ok || !b.ok) throw new Error("register failed");
    const ctxA = ctxFor(a.organizationId, a.userId);
    const ctxB = ctxFor(b.organizationId, b.userId);
    const rows = await addComparables(ctxA, [
      {
        kind: "sale",
        type: "transaction",
        price: 245_000,
        areaM2: 92,
        date: "2026-05-10",
        lat: 37.3826,
        lng: -5.9963,
        condition: "renovated",
        assetUse: "residential",
        reference: "not-1",
      },
      {
        kind: "sale",
        type: "professional",
        price: 190_000,
        areaM2: 88,
        date: "2026-04-02",
        lat: 37.3831,
        lng: -5.9958,
        condition: "unrenovated",
        assetUse: "residential",
      },
      {
        kind: "rent",
        type: "verified",
        price: 950,
        areaM2: 70,
        date: "2026-07-01",
        lat: 37.383,
        lng: -5.997,
        condition: "unknown",
        assetUse: "residential",
      },
      {
        kind: "sale",
        type: "transaction",
        price: 300_000,
        areaM2: 100,
        date: "2026-05-10",
        lat: 37.39,
        lng: -5.97,
        condition: "renovated",
        assetUse: "commercial",
      },
    ]);
    expect(rows).toHaveLength(4);
    const zoneId = rows[0]?.microzoneId;
    expect(zoneId).toBeTruthy();
    expect((await listComparables(ctxA)).length).toBe(4);
    expect((await listComparables(ctxA, { kind: "rent" })).length).toBe(1);
    expect(await listComparables(ctxB)).toEqual([]);

    const repo = comparablesRepository(ctxA);
    const near = await repo.list({
      microzoneId: zoneId!,
      point: { lat: 37.3826, lng: -5.9963 },
      radiusM: 1_500,
      assetUse: "residential",
    });
    expect(near.map((c) => c.type).sort()).toEqual(["professional", "transaction", "verified"]);
    const snapshot = await new OwnComparablesAdapter(repo).query({
      microzoneId: zoneId!,
      point: { lat: 37.3826, lng: -5.9963 },
      assetUse: "residential",
      areaM2: 90,
      analysisDate: "2026-09-27",
    });
    expect(snapshot.ok && snapshot.value.data.comparablesSale).toHaveLength(2);
    expect(snapshot.ok && snapshot.value.data.comparablesRent).toHaveLength(1);
    expect(snapshot.ok && snapshot.value.data.demo).toBe(false);
    const other = await comparablesRepository(ctxB).list({
      microzoneId: zoneId!,
      point: { lat: 37.3826, lng: -5.9963 },
      radiusM: 1_500,
      assetUse: "residential",
    });
    expect(other).toEqual([]);

    await expect(deleteComparable(ctxB, rows[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteComparable(ctxA, rows[0]!.id);
    expect((await listComparables(ctxA)).length).toBe(3);
    const viewer = ctxFor(a.organizationId, a.userId, "viewer");
    await expect(addComparables(viewer, [])).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("tenantAdapters only builds the own-comparables provider when MARKET_SOURCE_MODE asks for it", async () => {
    const a = await register(d(), { email: "cmp-c@example.com", name: "C", password: "long-enough-99" });
    if (!a.ok) throw new Error("register failed");
    const ctx = ctxFor(a.organizationId, a.userId);
    const previous = process.env.MARKET_SOURCE_MODE;
    try {
      process.env.MARKET_SOURCE_MODE = "demo";
      expect(tenantAdapters(ctx).market.sourceId).toBe("market-demo");
      process.env.MARKET_SOURCE_MODE = "own,demo";
      const set = tenantAdapters(ctx);
      expect(set.market).toBeInstanceOf(CompositeMarketAdapter);
      expect((set.market as CompositeMarketAdapter).providers[0]).toBeInstanceOf(OwnComparablesAdapter);
      expect((set.market as CompositeMarketAdapter).fallback?.sourceId).toBe("market-demo");
    } finally {
      if (previous === undefined) delete process.env.MARKET_SOURCE_MODE;
      else process.env.MARKET_SOURCE_MODE = previous;
    }
  });
});
