import { describe, expect, it } from "vitest";
import { CatastroDemoAdapter } from "./catastro/demo";
import { parseOvc } from "./catastro/public";
import { FinancingDemoAdapter } from "./financing/demo";
import { MarketDemoAdapter } from "./market/demo";
import { generateDemoListings } from "./sources/demo";
import { UrbanismoSevillaDemoAdapter } from "./urbanismo-sevilla/demo";
import { UrbanismoSevillaOfficialConnector } from "./urbanismo-sevilla/official";

describe("demo adapters are deterministic and labelled", () => {
  it("catastro demo returns the same fixture for the same address", async () => {
    const a = new CatastroDemoAdapter();
    const q = {
      kind: "address" as const,
      municipality: "SEVILLA",
      province: "SEVILLA",
      street: "Pureza",
      number: "45",
    };
    const r1 = await a.query(q);
    const r2 = await a.query(q);
    expect(r1.ok && r2.ok && r1.value.data.builtAreaM2).toBe(r2.ok && r2.value.data.builtAreaM2);
    expect(r1.ok && r1.value.evidence[0]?.demo).toBe(true);
    expect(r1.ok && r1.value.data.cadastralValue).toBeNull();
  });
  it("urbanism demo marks historic centre for Triana", async () => {
    const r = await new UrbanismoSevillaDemoAdapter().query({ address: "Calle Betis 12, Triana" });
    expect(r.ok && r.value.data.inHistoricCentre).toBe(true);
    expect(r.ok && r.value.data.zoningCode).toBe("CH");
  });
  it("official urbanism connector reports not configured instead of inventing data", async () => {
    const c = new UrbanismoSevillaOfficialConnector("");
    expect(await c.isAvailable()).toBe(false);
    const r = await c.query({ address: "x" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("SOURCE_NOT_CONFIGURED");
  });
  it("market demo produces comparables and stats with a demo flag", async () => {
    const r = await new MarketDemoAdapter().query({
      microzoneId: "sev-nervion",
      assetUse: "residential",
      areaM2: 90,
      analysisDate: "2026-01-15",
    });
    expect(r.ok && r.value.data.comparablesSale.length).toBe(9);
    expect(r.ok && r.value.data.demo).toBe(true);
    expect(r.ok && r.value.data.stats.sampleSize).toBe(0);
  });
  it("financing demo returns indicative offers", async () => {
    const r = await new FinancingDemoAdapter().query({
      purchasePrice: 200_000,
      totalCost: 270_000,
      durationMonths: 9,
      investorProfile: "private",
      assetUse: "residential",
    });
    expect(r.ok && r.value.data.every((o) => o.indicative && o.demo)).toBe(true);
  });
  it("demo listings include mispriced opportunities", () => {
    const l = generateDemoListings();
    expect(l.length).toBe(24);
    expect(l.every((x) => x.demo)).toBe(true);
  });
});

describe("OVC parser", () => {
  it("parses a Consulta_DNPRC-like payload", () => {
    const json = {
      consulta_dnprcResult: {
        bico: {
          bi: {
            idbi: { rc: { pc1: "4123456", pc2: "TG3442S", car: "0003", cc1: "X", cc2: "Y" } },
            dt: {
              np: "SEVILLA",
              nm: "SEVILLA",
              locs: {
                lous: { lourb: { dir: { tv: "CL", nv: "PUREZA", pnp: "45" }, loint: { pt: "03", pu: "A" } } },
              },
            },
            debi: { luso: "Residencial", sfc: "95", ant: "1930" },
          },
        },
      },
    };
    const p = parseOvc(json, { kind: "cadastralRef", cadastralRef: "4123456TG3442S0003XY" });
    expect(p?.builtAreaM2).toBe(95);
    expect(p?.yearBuilt).toBe(1930);
    expect(p?.address).toBe("CL PUREZA 45");
    expect(p?.units[0]?.floor).toBe("03");
  });
  it("returns null on empty payload", () => {
    expect(parseOvc({ consulta_dnprcResult: {} }, { kind: "cadastralRef", cadastralRef: "X" })).toBeNull();
  });
});
