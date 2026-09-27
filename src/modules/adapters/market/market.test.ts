import { describe, expect, it } from "vitest";
import { productionEnvProblems } from "@/server/env";
import { CompositeMarketAdapter, MIN_REAL_SALE_COMPARABLES } from "./composite";
import { MarketDemoAdapter } from "./demo";
import {
  IdealistaMarketAdapter,
  idealistaCondition,
  idealistaFloor,
  type IdealistaSearchResponse,
} from "./idealista";
import { createMarketAdapter, parseMarketModes } from "./index";
import { OwnComparablesAdapter } from "./own";
import { deriveStats, liquidityFromDepth, median } from "./stats";
import type { ComparablesRepository, MarketQuery, OwnComparable } from "./types";

const ENV = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ...extra });

const QUERY: MarketQuery = {
  microzoneId: "sev-triana",
  point: { lat: 37.3826, lng: -5.9963 },
  assetUse: "residential",
  areaM2: 90,
  analysisDate: "2026-09-27",
};

function listing(i: number, overrides: Record<string, unknown> = {}) {
  return {
    propertyCode: String(1000 + i),
    price: 250_000 + i * 5_000,
    size: 85 + i,
    latitude: 37.3826 + i * 0.0005,
    longitude: -5.9963,
    distance: 50 + i * 40,
    status: i % 3 === 0 ? "renew" : "good",
    floor: i % 2 ? "2" : "bj",
    hasLift: i % 2 === 0,
    exterior: true,
    url: `https://www.idealista.com/inmueble/${1000 + i}/`,
    address: `Calle Pureza ${i}`,
    neighborhood: "Triana",
    ...overrides,
  };
}

/** Fake Idealista backend: token endpoint + search endpoint with counters. */
function fakeIdealista(sale: IdealistaSearchResponse, rent: IdealistaSearchResponse) {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? "");
    calls.push({ url, body });
    if (url.endsWith("/oauth/token")) {
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      if (!auth.startsWith("Basic ")) return new Response("no auth", { status: 401 });
      return Response.json({ access_token: "tok", expires_in: 3600 });
    }
    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== "Bearer tok") return new Response("unauthorised", { status: 401 });
    const params = new URLSearchParams(body);
    return Response.json(params.get("operation") === "rent" ? rent : sale);
  };
  return { fetchImpl, calls };
}

describe("IdealistaMarketAdapter", () => {
  const sale: IdealistaSearchResponse = { elementList: [0, 1, 2, 3, 4, 5].map((i) => listing(i)), total: 42 };
  const rent: IdealistaSearchResponse = {
    elementList: [0, 1, 2].map((i) => listing(i, { price: 900 + i * 50, propertyCode: `r${i}` })),
    total: 12,
  };

  it("authenticates, searches sale and rent around the parcel and returns labelled asking comparables", async () => {
    const backend = fakeIdealista(sale, rent);
    const a = new IdealistaMarketAdapter({ apiKey: "k", apiSecret: "s" }, backend.fetchImpl);
    const r = await a.query(QUERY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mode).toBe("partner");
    expect(r.value.data.demo).toBe(false);
    expect(r.value.data.comparablesSale).toHaveLength(6);
    expect(r.value.data.comparablesRent).toHaveLength(3);
    const first = r.value.data.comparablesSale[0]!;
    expect(first.type).toBe("asking");
    expect(first.demo).toBe(false);
    expect(first.condition).toBe("unrenovated");
    expect(first.floor).toBe(0);
    expect(first.distanceM).toBe(50);
    expect(first.date).toBe(QUERY.analysisDate);
    expect(r.value.data.stats.sampleSize).toBe(6);
    expect(r.value.data.stats.liquidity).toBe("high");
    expect(r.value.data.stats.liquidityBasis).toBe("reference");
    expect(r.value.evidence.every((e) => e.demo === false && e.verificationStatus === "VERIFIED")).toBe(true);
    expect(r.value.evidence.filter((e) => e.sourceUrl?.includes("/inmueble/"))).toHaveLength(9);
    const search = backend.calls.find((c) => c.url.includes("/3.5/es/search"));
    expect(search?.body).toContain("center=37.38260%2C-5.99630");
    expect(search?.body).toContain("propertyType=homes");
    expect(search?.body).toContain("distance=1000");
    expect(backend.calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(1);
    expect(backend.calls).toHaveLength(3);
  });

  it("caches searches so a second analysis in the same area costs no request", async () => {
    const backend = fakeIdealista(sale, rent);
    const a = new IdealistaMarketAdapter({ apiKey: "k", apiSecret: "s" }, backend.fetchImpl);
    await a.query(QUERY);
    await a.query(QUERY);
    expect(backend.calls).toHaveLength(3);
  });

  it("reports missing credentials or a rejected login instead of inventing data", async () => {
    const none = new IdealistaMarketAdapter(
      { apiKey: "", apiSecret: "" },
      fakeIdealista(sale, rent).fetchImpl,
    );
    expect(await none.isAvailable()).toBe(false);
    const r = await none.query(QUERY);
    expect(!r.ok && r.error.code).toBe("SOURCE_NOT_CONFIGURED");
    const bad = new IdealistaMarketAdapter(
      { apiKey: "k", apiSecret: "s" },
      async () => new Response("nope", { status: 401 }),
    );
    const r2 = await bad.query(QUERY);
    expect(!r2.ok && r2.error.code).toBe("SOURCE_AUTH");
  });

  it("skips listings without price or size and falls back to haversine distance", async () => {
    const backend = fakeIdealista(
      {
        elementList: [
          listing(0, { price: 0 }),
          listing(1, { size: undefined }),
          listing(2, { distance: undefined, latitude: 37.3826, longitude: -5.9963 }),
        ],
      },
      { elementList: [] },
    );
    const a = new IdealistaMarketAdapter({ apiKey: "k", apiSecret: "s" }, backend.fetchImpl);
    const r = await a.query(QUERY);
    expect(r.ok && r.value.data.comparablesSale).toHaveLength(1);
    expect(r.ok && r.value.data.comparablesSale[0]?.distanceM).toBeLessThan(150);
  });

  it("maps Idealista status and floor codes", () => {
    expect(idealistaCondition({ status: "renew" })).toBe("unrenovated");
    expect(idealistaCondition({ status: "good" })).toBe("unknown");
    expect(idealistaCondition({ status: "good", newDevelopment: true })).toBe("new");
    expect(idealistaFloor("bj")).toBe(0);
    expect(idealistaFloor("3")).toBe(3);
    expect(idealistaFloor("ss")).toBe(-1);
    expect(idealistaFloor("ático")).toBeUndefined();
  });
});

function ownRows(n: number, kind: OwnComparable["kind"] = "sale"): OwnComparable[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `cmp_own_${kind}_${i}`,
    kind,
    type: "transaction",
    price: kind === "sale" ? 230_000 + i * 10_000 + (i % 2 ? 60_000 : 0) : 950 + i * 25,
    areaM2: 80 + i * 5,
    date: "2026-06-15",
    point: { lat: 37.3826 + i * 0.001, lng: -5.9963 },
    condition: i % 2 ? "renovated" : "unrenovated",
    assetUse: "residential",
    label: `Testigo ${i}`,
    reference: `notaría-${i}`,
  }));
}

const repo = (rows: OwnComparable[]): ComparablesRepository => ({ list: async () => rows });

describe("OwnComparablesAdapter", () => {
  it("turns the organisation's transactions into verified comparables within the radius", async () => {
    const far: OwnComparable = { ...ownRows(1)[0]!, id: "cmp_far", point: { lat: 37.45, lng: -5.9963 } };
    const a = new OwnComparablesAdapter(repo([...ownRows(4), ...ownRows(2, "rent"), far]));
    const r = await a.query(QUERY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.data.comparablesSale.map((c) => c.id)).not.toContain("cmp_far");
    expect(r.value.data.comparablesSale).toHaveLength(4);
    expect(r.value.data.comparablesRent).toHaveLength(2);
    expect(r.value.data.comparablesSale[0]?.type).toBe("transaction");
    expect(r.value.data.demo).toBe(false);
    expect(r.value.evidence[0]?.sourceType).toBe("market_transaction");
    expect(r.value.evidence[0]?.documentId).toBe("notaría-0");
    expect(r.value.data.stats.renovatedPerM2).toBeGreaterThan(r.value.data.stats.unrenovatedPerM2);
  });
  it("manual witnesses are flagged for review, not verified", async () => {
    const manual: OwnComparable = { ...ownRows(1)[0]!, type: "manual" };
    const r = await new OwnComparablesAdapter(repo([manual])).query(QUERY);
    expect(r.ok && r.value.evidence[0]?.verificationStatus).toBe("REVIEW_REQUIRED");
  });
});

describe("CompositeMarketAdapter", () => {
  const idealista = () =>
    new IdealistaMarketAdapter(
      { apiKey: "k", apiSecret: "s" },
      fakeIdealista(
        { elementList: [0, 1, 2, 3].map((i) => listing(i)), total: 20 },
        { elementList: [0, 1].map((i) => listing(i, { price: 900, propertyCode: `r${i}` })), total: 5 },
      ).fetchImpl,
    );

  it("merges own transactions with listings and stays real (no DEMO) when the sample is enough", async () => {
    const c = new CompositeMarketAdapter(
      [new OwnComparablesAdapter(repo(ownRows(2))), idealista()],
      new MarketDemoAdapter(),
    );
    const r = await c.query(QUERY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.data.demo).toBe(false);
    expect(r.value.data.comparablesSale).toHaveLength(6);
    expect(r.value.data.comparablesSale.some((x) => x.demo)).toBe(false);
    expect(r.value.data.sources?.map((s) => s.sourceId)).toEqual(["own-comparables", "idealista-api"]);
    expect(r.value.data.comparablesSale.filter((x) => x.type === "transaction")).toHaveLength(2);
    expect(r.value.evidence.some((e) => e.demo)).toBe(false);
  });

  it("falls back to labelled DEMO data when the real sample is too thin", async () => {
    const thin = new IdealistaMarketAdapter(
      { apiKey: "k", apiSecret: "s" },
      fakeIdealista({ elementList: [listing(0)], total: 1 }, { elementList: [] }).fetchImpl,
    );
    const c = new CompositeMarketAdapter([thin], new MarketDemoAdapter());
    const r = await c.query(QUERY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.data.demo).toBe(true);
    expect(r.value.data.comparablesSale.length).toBeGreaterThanOrEqual(MIN_REAL_SALE_COMPARABLES);
    expect(r.value.data.comparablesSale.filter((x) => x.demo).length).toBeGreaterThan(0);
    expect(r.value.data.stats.confidenceNote).toContain("DEMO");
    expect(r.value.data.stats.liquidityBasis).toBe("demo");
    expect(r.value.data.sources?.some((s) => s.demo)).toBe(true);
  });

  it("without a fallback it returns the thin real sample honestly, or an error when nothing answered", async () => {
    const thin = new CompositeMarketAdapter([new OwnComparablesAdapter(repo(ownRows(1)))]);
    const r = await thin.query(QUERY);
    expect(r.ok && r.value.data.demo).toBe(false);
    expect(r.ok && r.value.data.comparablesSale).toHaveLength(1);
    expect(r.ok && r.value.data.stats.confidenceNote).toContain("insuficiente");
    const dead = new CompositeMarketAdapter([
      new IdealistaMarketAdapter(
        { apiKey: "k", apiSecret: "s" },
        async () => new Response("x", { status: 500 }),
      ),
    ]);
    const r2 = await dead.query(QUERY);
    expect(!r2.ok && r2.error.code).toBe("SOURCE_UNAVAILABLE");
  });

  it("a failing provider is reported in the note while the others carry on", async () => {
    const dead = new IdealistaMarketAdapter(
      { apiKey: "k", apiSecret: "s" },
      async () => new Response("x", { status: 500 }),
    );
    const c = new CompositeMarketAdapter([
      new OwnComparablesAdapter(repo([...ownRows(4), ...ownRows(1, "rent")])),
      dead,
    ]);
    const r = await c.query(QUERY);
    expect(r.ok && r.value.data.demo).toBe(false);
    expect(r.ok && r.value.data.comparablesSale).toHaveLength(4);
    expect(r.ok && r.value.data.stats.confidenceNote).toContain("Fuente no disponible: Idealista");
  });
});

describe("createMarketAdapter / MARKET_SOURCE_MODE", () => {
  it("parses comma separated modes", () => {
    expect(parseMarketModes(undefined)).toEqual(["demo"]);
    expect(parseMarketModes(" own, Idealista ,demo")).toEqual(["own", "idealista", "demo"]);
  });
  it("builds demo, composite with or without fallback, and rejects unknown modes", () => {
    expect(createMarketAdapter("demo", { env: ENV() })).toBeInstanceOf(MarketDemoAdapter);
    const real = createMarketAdapter("own,idealista", {
      env: ENV({ IDEALISTA_API_KEY: "k", IDEALISTA_API_SECRET: "s" }),
      ownComparables: repo([]),
    });
    expect(real).toBeInstanceOf(CompositeMarketAdapter);
    expect((real as CompositeMarketAdapter).providers.map((p) => p.sourceId)).toEqual([
      "own-comparables",
      "idealista-api",
    ]);
    expect((real as CompositeMarketAdapter).fallback).toBeUndefined();
    const withFallback = createMarketAdapter("idealista,demo", {
      env: ENV({ IDEALISTA_API_KEY: "k", IDEALISTA_API_SECRET: "s" }),
    });
    expect((withFallback as CompositeMarketAdapter).fallback).toBeInstanceOf(MarketDemoAdapter);
    // `own` without a tenant repository (e.g. the shared global set) degrades to demo rather than exposing other tenants.
    expect(createMarketAdapter("own", { env: ENV() })).toBeInstanceOf(MarketDemoAdapter);
    expect(() => createMarketAdapter("scraper", { env: ENV() })).toThrow(/not supported/);
  });
  it("production env validation understands the new modes", () => {
    const base = { DATABASE_URL: "postgres://x", APP_SECRET: "a".repeat(40), DEMO_MODE: "false" };
    expect(
      productionEnvProblems(
        ENV({
          ...base,
          MARKET_SOURCE_MODE: "own,idealista",
          IDEALISTA_API_KEY: "k",
          IDEALISTA_API_SECRET: "s",
        }),
      ),
    ).toEqual([]);
    expect(productionEnvProblems(ENV({ ...base, MARKET_SOURCE_MODE: "idealista" })).join(" ")).toContain(
      "IDEALISTA_API_KEY",
    );
    expect(productionEnvProblems(ENV({ ...base, MARKET_SOURCE_MODE: "partner" })).join(" ")).toContain(
      "not supported",
    );
  });
});

describe("derived market statistics", () => {
  it("median and liquidity thresholds", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(liquidityFromDepth(30)).toBe("high");
    expect(liquidityFromDepth(10)).toBe("medium");
    expect(liquidityFromDepth(2)).toBe("low");
  });
  it("estimates the missing condition from the overall median and says so", () => {
    const stats = deriveStats({
      sale: [
        {
          id: "a",
          type: "asking",
          sourceId: "x",
          price: 300_000,
          areaM2: 100,
          date: "2026-01-01",
          distanceM: 10,
          condition: "unknown",
          assetUse: "residential",
        },
        {
          id: "b",
          type: "asking",
          sourceId: "x",
          price: 200_000,
          areaM2: 100,
          date: "2026-01-01",
          distanceM: 10,
          condition: "unrenovated",
          assetUse: "residential",
        },
      ],
      rent: [
        {
          id: "r",
          monthlyRent: 1_000,
          areaM2: 100,
          date: "2026-01-01",
          distanceM: 10,
          type: "asking",
          demo: false,
        },
      ],
    });
    expect(stats.unrenovatedPerM2).toBe(2_000);
    expect(stats.renovatedPerM2).toBe(2_875);
    expect(stats.rentPerM2Month).toBe(10);
    expect(stats.confidenceNote).toContain("reformado estimado");
    expect(stats.daysToSell).toBe(150);
  });
});
