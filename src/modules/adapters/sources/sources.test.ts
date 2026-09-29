import { describe, expect, it } from "vitest";
import { productionEnvProblems } from "@/server/env";
import { defaultCity } from "@/modules/city/registry";
import { IdealistaClient } from "../idealista";
import { FeedListingsSource, parseFeedsConfig } from "./feed";
import { IdealistaListingsSource } from "./idealista";
import { createListingSources, parseIdealistaPropertyTypes, parseRadarModes } from "./index";
import { conditionFromText, microzoneIdFor, typologyFromText } from "./mapping";

const ENV = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ...extra });
const city = defaultCity();
const triana = city.microzones.find((z) => z.id === "sev-triana")!;

function element(i: number, zone = triana, overrides: Record<string, unknown> = {}) {
  return {
    propertyCode: `${zone.id}-${i}`,
    price: 200_000 + i * 10_000,
    size: 80 + i,
    latitude: zone.centroid.lat + i * 0.0004,
    longitude: zone.centroid.lng,
    status: i % 2 ? "renew" : "good",
    floor: "2",
    hasLift: true,
    rooms: 3,
    bathrooms: 1,
    url: `https://www.idealista.com/inmueble/${zone.id}-${i}/`,
    address: `Calle ${i}`,
    neighborhood: zone.name,
    municipality: "Sevilla",
    propertyType: i === 0 ? "penthouse" : "flat",
    ...overrides,
  };
}

/** Fake Idealista backend answering per centre with two pages. */
function backend(perZone: number, pages = 2) {
  const calls: URLSearchParams[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/oauth/token")) return Response.json({ access_token: "tok", expires_in: 3600 });
    const params = new URLSearchParams(init?.body instanceof URLSearchParams ? init.body.toString() : "");
    calls.push(params);
    const centre = params.get("center") ?? "";
    const zone =
      city.microzones.find((z) => centre === `${z.centroid.lat.toFixed(5)},${z.centroid.lng.toFixed(5)}`) ??
      triana;
    const page = Number(params.get("numPage") ?? 1);
    const elementList = Array.from({ length: perZone }, (_, i) => element(i + (page - 1) * perZone, zone));
    return Response.json({ elementList, total: perZone * pages, totalPages: pages, actualPage: page });
  };
  return { fetchImpl, calls };
}

describe("IdealistaListingsSource", () => {
  it("pulls sale listings per microzone and page, mapped to Radar listings with source and URL", async () => {
    const b = backend(3, 2);
    const client = new IdealistaClient(
      { apiKey: "k", apiSecret: "s", now: () => Date.parse("2026-09-29T10:00:00Z") },
      b.fetchImpl,
    );
    const src = new IdealistaListingsSource(client, { maxPages: 2 });
    const r = await src.fetchAll();
    expect(r.errors).toEqual([]);
    expect(r.complete).toBe(true);
    expect(r.listings).toHaveLength(city.microzones.length * 6);
    expect(b.calls).toHaveLength(city.microzones.length * 2);
    expect(b.calls[0]?.get("operation")).toBe("sale");
    expect(b.calls[0]?.get("propertyType")).toBe("homes");
    const first = r.listings.find((l) => l.reference === "sev-triana-0")!;
    expect(first.id).toBe("lst_idealista_sev-triana-0");
    expect(first.sourceName).toBe("Idealista (API oficial)");
    expect(first.microzoneId).toBe("sev-triana");
    expect(first.typology).toBe("penthouse");
    expect(first.condition).toBe("good");
    expect(first.askingPrice).toBe(200_000);
    expect(first.publishedAt).toBe("2026-09-29");
    expect(first.priceHistory).toEqual([{ date: "2026-09-29", price: 200_000 }]);
    expect(first.url).toContain("/inmueble/");
    expect(first.demo).toBe(false);
    expect(r.listings.find((l) => l.reference === "sev-triana-1")?.condition).toBe("to_renovate");
    const filtered = await src.listings({ microzoneIds: ["sev-triana"], maxPrice: 215_000 });
    expect(filtered.every((l) => l.microzoneId === "sev-triana" && l.askingPrice <= 215_000)).toBe(true);
  });
  it("reports an incomplete pull when pages are truncated or a zone fails", async () => {
    const b = backend(2, 5);
    const client = new IdealistaClient({ apiKey: "k", apiSecret: "s" }, b.fetchImpl);
    const r = await new IdealistaListingsSource(client, { maxPages: 1 }).fetchAll();
    expect(r.complete).toBe(false);
    expect(r.listings).toHaveLength(city.microzones.length * 2);
    const dead = new IdealistaClient(
      { apiKey: "k", apiSecret: "s" },
      async () => new Response("x", { status: 500 }),
    );
    const r2 = await new IdealistaListingsSource(dead).fetchAll();
    expect(r2.complete).toBe(false);
    expect(r2.errors.length).toBe(city.microzones.length);
    expect(r2.listings).toEqual([]);
  });
  it("without credentials it is unavailable and pulls nothing", async () => {
    const src = new IdealistaListingsSource(new IdealistaClient({ apiKey: "", apiSecret: "" }));
    expect(await src.isAvailable()).toBe(false);
    expect((await src.fetchAll()).errors[0]).toContain("credenciales");
  });
});

const KYERO = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <kyero><feed_version>3</feed_version></kyero>
  <property>
    <id>101</id><date>2026-08-01 10:00:00</date><ref>AG-101</ref>
    <price>245000</price><currency>EUR</currency><price_freq>sale</price_freq><new_build>0</new_build>
    <type>Apartment</type><town>Sevilla</town><province>Sevilla</province><location_detail>Triana</location_detail>
    <beds>3</beds><baths>2</baths>
    <surface_area><built>95</built><plot>0</plot></surface_area>
    <location><latitude>${triana.centroid.lat}</latitude><longitude>${triana.centroid.lng}</longitude></location>
    <url><es>https://agencia.example/101</es></url>
    <title><es>Piso reformado junto al río</es><en>Renovated flat</en></title>
    <desc><es><![CDATA[Totalmente reformado & luminoso]]></es></desc>
    <features><feature>Lift</feature><feature>Terrace</feature></features>
  </property>
  <property>
    <id>102</id><ref>AG-102</ref><price>1200</price><price_freq>month</price_freq><type>Apartment</type><town>Sevilla</town>
    <surface_area><built>70</built></surface_area>
  </property>
  <property>
    <id>103</id><ref>AG-103</ref><price>180000</price><price_freq>sale</price_freq><type>Commercial premises</type><town>Sevilla</town>
    <surface_area><built>120</built></surface_area>
    <desc><es>Local a reformar en calle comercial</es></desc>
  </property>
</root>`;

describe("FeedListingsSource", () => {
  const cfg = {
    id: "agencia-x",
    name: "Agencia X",
    url: "https://agencia.example/feed.xml",
    format: "kyero" as const,
  };
  it("parses a Kyero v3 feed: only sale listings, localised text, features and microzone from coordinates", async () => {
    const src = new FeedListingsSource(
      cfg,
      async () => new Response(KYERO, { status: 200 }),
      city,
      () => Date.parse("2026-09-29"),
    );
    const r = await src.fetchAll();
    expect(r.errors).toEqual([]);
    expect(r.complete).toBe(true);
    expect(r.listings.map((l) => l.reference)).toEqual(["AG-101", "AG-103"]);
    const a = r.listings[0]!;
    expect(a.id).toBe("lst_agencia-x_101");
    expect(a.sourceId).toBe("feed-agencia-x");
    expect(a.title).toBe("Piso reformado junto al río");
    expect(a.microzoneId).toBe("sev-triana");
    expect(a.condition).toBe("renovated");
    expect(a.elevator).toBe(true);
    expect(a.bedrooms).toBe(3);
    expect(a.publishedAt).toBe("2026-08-01");
    expect(a.url).toBe("https://agencia.example/101");
    const b = r.listings[1]!;
    expect(b.typology).toBe("premises");
    expect(b.assetUse).toBe("commercial");
    expect(b.condition).toBe("to_renovate");
    expect(b.microzoneId).toBeUndefined();
  });
  it("parses a JSON feed with tolerant field names", async () => {
    const body = JSON.stringify({
      listings: [
        {
          ref: "J-1",
          price: "199.000",
          area: 88,
          lat: triana.centroid.lat,
          lng: triana.centroid.lng,
          type: "piso",
          condition: "para reformar",
          url: "https://x.example/1",
          bedrooms: 2,
          date: "2026-09-01",
        },
        { ref: "J-2", price: 0, area: 88 },
      ],
    });
    const src = new FeedListingsSource(
      { ...cfg, format: "json" },
      async () => new Response(body, { status: 200 }),
      city,
    );
    const r = await src.fetchAll();
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0]).toMatchObject({
      reference: "J-1",
      askingPrice: 199,
      typology: "flat",
      condition: "to_renovate",
      microzoneId: "sev-triana",
      bedrooms: 2,
      publishedAt: "2026-09-01",
    });
  });
  it("an HTTP error or malformed body is an incomplete pull, never withdrawals", async () => {
    const down = new FeedListingsSource(cfg, async () => new Response("", { status: 503 }), city);
    expect(await down.fetchAll()).toMatchObject({ listings: [], complete: false });
    const bad = new FeedListingsSource(
      { ...cfg, format: "json" },
      async () => new Response("{not json", { status: 200 }),
      city,
    );
    const r = await bad.fetchAll();
    expect(r.complete).toBe(false);
    expect(r.errors[0]).toContain("Agencia X");
  });
  it("validates RADAR_FEEDS", () => {
    expect(parseFeedsConfig(undefined)).toEqual({ feeds: [] });
    expect(
      parseFeedsConfig('[{"id":"a-1","name":"A","url":"https://a.example/f.xml","format":"kyero"}]').feeds,
    ).toHaveLength(1);
    expect(
      parseFeedsConfig('[{"id":"A 1","name":"A","url":"http://a.example/f","format":"csv"}]').error,
    ).toBeTruthy();
    expect(
      parseFeedsConfig(
        '[{"id":"ag","name":"A","url":"https://a.example/f","format":"json"},{"id":"ag","name":"B","url":"https://b.example/f","format":"json"}]',
      ).error,
    ).toContain("duplicado");
    expect(parseFeedsConfig("nope").error).toBeTruthy();
  });
});

describe("mapping helpers", () => {
  it("typology, condition and microzone", () => {
    expect(typologyFromText("Ático dúplex")).toBe("penthouse");
    expect(typologyFromText("Villa")).toBe("house");
    expect(typologyFromText("Local comercial")).toBe("premises");
    expect(typologyFromText("garage")).toBe("garage");
    expect(typologyFromText(undefined)).toBe("other");
    expect(conditionFromText("to_renovate")).toBe("to_renovate");
    expect(conditionFromText("recién reformado")).toBe("renovated");
    expect(conditionFromText("good")).toBe("good");
    expect(conditionFromText("")).toBe("unknown");
    expect(microzoneIdFor(triana.centroid, city)).toBe("sev-triana");
    expect(microzoneIdFor({ lat: 40.4, lng: -3.7 }, city)).toBeUndefined();
    expect(microzoneIdFor(undefined, city)).toBeUndefined();
  });
});

describe("createListingSources / RADAR_SOURCES", () => {
  it("parses modes and property types", () => {
    expect(parseRadarModes(undefined)).toEqual(["demo"]);
    expect(parseRadarModes("Idealista, feeds")).toEqual(["idealista", "feeds"]);
    expect(parseIdealistaPropertyTypes(undefined)).toEqual(["homes"]);
    expect(parseIdealistaPropertyTypes("premises,homes,bogus")).toEqual(["homes", "premises"]);
  });
  it("builds the configured sources and rejects unknown ones", () => {
    const feeds = JSON.stringify([
      { id: "ag", name: "Ag", url: "https://ag.example/f.xml", format: "kyero" },
    ]);
    const sources = createListingSources("demo,idealista,feeds", {
      env: ENV({ IDEALISTA_API_KEY: "k", IDEALISTA_API_SECRET: "s", RADAR_FEEDS: feeds }),
    });
    expect(sources.map((s) => s.sourceId)).toEqual(["listings-demo", "idealista-api", "feed-ag"]);
    expect(sources.map((s) => s.kind)).toEqual(["demo", "api", "partner"]);
    expect(() => createListingSources("scraper", { env: ENV() })).toThrow(/not supported/);
    expect(() => createListingSources("feeds", { env: ENV({ RADAR_FEEDS: "[{}]" }) })).toThrow(/RADAR_FEEDS/);
  });
  it("production env validation covers the Radar sources", () => {
    const base = { DATABASE_URL: "postgres://x", APP_SECRET: "a".repeat(40), DEMO_MODE: "false" };
    expect(
      productionEnvProblems(
        ENV({ ...base, RADAR_SOURCES: "idealista", IDEALISTA_API_KEY: "k", IDEALISTA_API_SECRET: "s" }),
      ),
    ).toEqual([]);
    expect(productionEnvProblems(ENV({ ...base, RADAR_SOURCES: "idealista" })).join(" ")).toContain(
      "IDEALISTA_API_KEY",
    );
    expect(productionEnvProblems(ENV({ ...base, RADAR_SOURCES: "feeds" })).join(" ")).toContain(
      "RADAR_FEEDS is empty",
    );
    expect(
      productionEnvProblems(ENV({ ...base, RADAR_SOURCES: "feeds", RADAR_FEEDS: "[" })).join(" "),
    ).toContain("RADAR_FEEDS is invalid");
    expect(productionEnvProblems(ENV({ ...base, RADAR_SOURCES: "fotocasa-scraper" })).join(" ")).toContain(
      "not supported",
    );
  });
});
