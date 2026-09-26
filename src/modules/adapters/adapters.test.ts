import { describe, expect, it } from "vitest";
import { CatastroDemoAdapter } from "./catastro/demo";
import {
  CatastroPublicAdapter,
  catastroUseToAssetUse,
  parseOvc,
  resolveCatastroUseCode,
} from "./catastro/public";
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

/** Realistic Consulta_DNPRC-shaped payload; `debi` mirrors what the OVC JSON returns. */
const ovcPayload = (debi: Record<string, string | undefined>) => ({
  consulta_dnprcResult: {
    control: { cudnp: "1" },
    bico: {
      bi: {
        idbi: { cn: "UR", rc: { pc1: "4123456", pc2: "TG3442S", car: "0003", cc1: "X", cc2: "Y" } },
        dt: {
          loine: { cp: "41", cm: "900" },
          cmc: "900",
          np: "SEVILLA",
          nm: "SEVILLA",
          locs: {
            lous: {
              lourb: {
                dir: { cv: "5101", tv: "CL", nv: "PUREZA", pnp: "45" },
                loint: { es: "1", pt: "03", pu: "A" },
                dp: "41010",
                dm: "3",
              },
            },
          },
        },
        ldt: "CL PUREZA 45 Es:1 Pl:03 Pt:A 41010 SEVILLA (SEVILLA)",
        debi: debi,
      },
    },
  },
});
const rcQuery = { kind: "cadastralRef" as const, cadastralRef: "4123456TG3442S0003XY" };

describe("OVC use mapping", () => {
  it("maps descriptive labels (case/accent-insensitive) to canonical codes", () => {
    expect(resolveCatastroUseCode("Residencial")).toBe("V");
    expect(resolveCatastroUseCode("RESIDENCIAL")).toBe("V");
    expect(resolveCatastroUseCode("Comercial")).toBe("C");
    expect(resolveCatastroUseCode("Oficinas")).toBe("O");
    expect(resolveCatastroUseCode("Oficina")).toBe("O");
    expect(resolveCatastroUseCode("Industrial")).toBe("I");
    expect(resolveCatastroUseCode("Almacén-Estacionamiento")).toBe("A");
    expect(resolveCatastroUseCode("ALMACEN ESTACIONAMIENTO")).toBe("A");
    expect(resolveCatastroUseCode("Religioso")).toBe("R");
    expect(resolveCatastroUseCode("Suelo sin edificar")).toBe("M");
    expect(resolveCatastroUseCode("Solar")).toBe("M");
    expect(resolveCatastroUseCode("Ocio y Hostelería")).toBe("G");
  });
  it("accepts single-letter codes and rejects unknown values", () => {
    expect(resolveCatastroUseCode("V")).toBe("V");
    expect(resolveCatastroUseCode("c")).toBe("C");
    expect(resolveCatastroUseCode("Q")).toBe("");
    expect(resolveCatastroUseCode("Cosa rara")).toBe("");
    expect(resolveCatastroUseCode(undefined)).toBe("");
  });
  it("maps codes to the engine's asset use", () => {
    expect(catastroUseToAssetUse("V")).toBe("residential");
    expect(catastroUseToAssetUse("C")).toBe("commercial");
    expect(catastroUseToAssetUse("O")).toBe("office");
    expect(catastroUseToAssetUse("I")).toBe("industrial");
    expect(catastroUseToAssetUse("M")).toBe("land");
    expect(catastroUseToAssetUse("A")).toBe("other");
    expect(catastroUseToAssetUse("R")).toBe("other");
    expect(catastroUseToAssetUse("")).toBeUndefined();
  });
  it("parses the 'Residencial' label into code V without truncating it to 'R'", () => {
    const p = parseOvc(ovcPayload({ luso: "Residencial", sfc: "95", ant: "1930" }), rcQuery);
    expect(p?.useCode).toBe("V");
    expect(p?.useLabel).toBe("Residencial");
    expect(p?.units[0]?.useCode).toBe("V");
  });
  it("keeps single-letter codes when the service returns them", () => {
    const p = parseOvc(ovcPayload({ luso: "C", sfc: "120", ant: "1965" }), rcQuery);
    expect(p?.useCode).toBe("C");
    expect(p?.useLabel).toBe("Comercial");
  });
  it("leaves the use unmapped (and keeps the raw label) when it is unknown", () => {
    const p = parseOvc(ovcPayload({ luso: "Uso extraño", sfc: "120" }), rcQuery);
    expect(p?.useCode).toBeUndefined();
    expect(p?.useLabel).toBe("Uso extraño");
  });
  it("reports a missing area as undefined instead of 0", () => {
    const p = parseOvc(ovcPayload({ luso: "Residencial", ant: "1930" }), rcQuery);
    expect(p?.builtAreaM2).toBeUndefined();
    expect(p?.useCode).toBe("V");
  });
});

describe("CatastroPublicAdapter evidence status", () => {
  const fetchWith = (body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  it("marks a complete record as VERIFIED with the mapped asset use", async () => {
    const a = new CatastroPublicAdapter(
      fetchWith(ovcPayload({ luso: "Residencial", sfc: "95", ant: "1930" })),
    );
    const r = await a.query(rcQuery);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.evidence[0]?.verificationStatus).toBe("VERIFIED");
    expect(r.value.evidence[0]?.structuredData?.assetUse).toBe("residential");
    expect(r.value.evidence[0]?.structuredData?.useCode).toBe("V");
    expect(r.value.evidence[0]?.demo).toBe(false);
  });
  it("downgrades to INFERRED with a note when the built area is missing", async () => {
    const a = new CatastroPublicAdapter(fetchWith(ovcPayload({ luso: "Residencial", ant: "1930" })));
    const r = await a.query(rcQuery);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.data.builtAreaM2).toBeUndefined();
    expect(r.value.evidence[0]?.verificationStatus).toBe("INFERRED");
    expect(r.value.evidence[0]?.excerpt).toMatch(/Superficie construida no informada/);
    expect(r.value.evidence[0]?.structuredData?.notes).toHaveLength(1);
  });
  it("downgrades to INFERRED when the use cannot be mapped", async () => {
    const a = new CatastroPublicAdapter(fetchWith(ovcPayload({ luso: "Uso extraño", sfc: "80" })));
    const r = await a.query(rcQuery);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.evidence[0]?.verificationStatus).toBe("INFERRED");
    expect(r.value.evidence[0]?.excerpt).toMatch(/no reconocido/);
    expect(r.value.evidence[0]?.structuredData?.assetUse).toBeUndefined();
  });
});
