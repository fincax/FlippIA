import { describe, expect, it } from "vitest";
import { applicableRegulations, buildRegulatorySnapshot, regulatoryPreamble, versionInForce } from "./engine";
import { JURISDICTIONS, REGULATORY_REGISTRY, findRegulation } from "./registry";
import { assessRegulatoryChange } from "./watcher";

const chain = [JURISDICTIONS.EU, JURISDICTIONS.ES, JURISDICTIONS.AND, JURISDICTIONS.SEVILLA];

describe("regulatory registry integrity", () => {
  it("every version has dates, a source and a verification status", () => {
    for (const r of REGULATORY_REGISTRY) {
      expect(r.versions.length).toBeGreaterThan(0);
      for (const v of r.versions) {
        expect(v.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(v.sourceName.length).toBeGreaterThan(0);
        expect(["VERIFIED", "INFERRED", "REVIEW_REQUIRED", "CONFLICT", "UNKNOWN"]).toContain(
          v.verificationStatus,
        );
        expect(v.ingestedAt).toBeTruthy();
      }
    }
  });
  it("cites only official sources and never claims VERIFIED without a verification date", () => {
    const official =
      /^https:\/\/(eur-lex\.europa\.eu|www\.boe\.es|www\.juntadeandalucia\.es|www\.urbanismosevilla\.org|www\.sevilla\.org|www\.dipusevilla\.es|www\.doshermanas\.es|www\.alcaladeguadaira\.es)\//;
    const today = new Date().toISOString().slice(0, 10);
    for (const r of REGULATORY_REGISTRY) {
      for (const v of r.versions) {
        expect(v.sourceUrl, `${v.id} sourceUrl`).toMatch(official);
        expect(v.sourceName.length, `${v.id} sourceName`).toBeGreaterThanOrEqual(3);
        if (v.verificationStatus === "VERIFIED") expect(v.verifiedAt, `${v.id} verifiedAt`).toBeTruthy();
        if (v.status === "in_force") expect(v.effectiveFrom <= today, `${v.id} effectiveFrom`).toBe(true);
        if (r.jurisdiction.level === "municipality")
          expect(v.sourceName, `${v.id} municipal citation`).toMatch(
            /BOP|BOJA|Gerencia|Agencia Tributaria|Ayuntamiento/,
          );
      }
    }
  });
  it("ids are unique", () => {
    const ids = REGULATORY_REGISTRY.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("applicability", () => {
  it("selects Sevilla, Andalucía, Spain and EU rules for a change of use", () => {
    const hits = applicableRegulations({
      jurisdictionChain: chain,
      topics: ["change_of_use", "licence", "heritage"],
      assetUse: "commercial",
      analysisDate: "2026-01-15",
    });
    const ids = hits.map((h) => h.regulation.id);
    expect(ids).toContain("reg.es.sevilla.pgou-2006");
    expect(ids).toContain("reg.es.and.lista.ley7-2021");
    expect(ids).toContain("reg.es.lph.ley49-1960");
    expect(hits[0]!.regulation.jurisdiction.level).toBe("municipality");
  });
  it("filters by asset use", () => {
    const hits = applicableRegulations({
      jurisdictionChain: chain,
      topics: ["tourism"],
      assetUse: "commercial",
      analysisDate: "2026-01-15",
    });
    expect(hits.map((h) => h.regulation.id)).not.toContain("reg.es.and.vft.d28-2016");
  });
  it("respects effective dates", () => {
    const reg = findRegulation("reg.eu.str-data-2024")!;
    expect(versionInForce(reg, "2025-01-01")).toBeUndefined();
    expect(versionInForce(reg, "2026-06-01")?.version).toBe("2024");
  });
  it("selects the 2026 ICIO ordinance and both VUT instruments for a 2026 analysis", () => {
    const icio = findRegulation("reg.es.sevilla.ordenanza-icio")!;
    expect(versionInForce(icio, "2025-06-01")?.version).toBe("2025");
    expect(versionInForce(icio, "2026-09-28")?.version).toBe("2026");
    const hits = applicableRegulations({
      jurisdictionChain: chain,
      topics: ["tourism"],
      assetUse: "residential",
      analysisDate: "2026-09-28",
    });
    const ids = hits.map((h) => h.regulation.id);
    expect(ids).toContain("reg.es.sevilla.vft-pgou");
    expect(ids).toContain("reg.es.sevilla.vut-limite-10");
  });
  it("keeps the sector plans in force and never applies their pending 2026 amendment", () => {
    const q = { jurisdictionChain: chain, topics: ["heritage" as const], analysisDate: "2026-09-28" };
    const hits = applicableRegulations(q);
    const byId = new Map(hits.map((h) => [h.regulation.id, h.version]));
    expect(byId.get("reg.es.sevilla.pepch")?.status).toBe("in_force");
    expect(byId.has("reg.es.sevilla.pepch-entornos-bic-2026")).toBe(false);
    const snapshot = buildRegulatorySnapshot(q);
    expect(snapshot.pending?.map((e) => e.regulationId)).toContain("reg.es.sevilla.pepch-entornos-bic-2026");
    expect(snapshot.pending?.every((e) => e.status === "pending")).toBe(true);
    expect(regulatoryPreamble(snapshot)).toContain("en tramitación");
  });
  it("never selects a repealed version", () => {
    const reg = findRegulation("reg.eu.str-data-2024")!;
    const repealed = {
      ...reg,
      versions: reg.versions.map((v) => ({ ...v, status: "repealed" as const })),
    };
    expect(versionInForce(repealed, "2026-06-01")).toBeUndefined();
  });
});

describe("snapshot", () => {
  it("records versions, fingerprint and gaps", () => {
    const snap = buildRegulatorySnapshot({
      jurisdictionChain: chain,
      topics: ["tax.acquisition", "consumer"],
      analysisDate: "2026-01-15",
    });
    expect(snap.entries.length).toBeGreaterThan(0);
    expect(snap.fingerprint).toHaveLength(16);
    expect(snap.gaps.map((g) => g.topic)).toContain("consumer");
    expect(regulatoryPreamble(snap)).toContain("2026-01-15");
  });
  it("reports municipal matters no municipal instrument in the registry answers", () => {
    const dosHermanas = [
      JURISDICTIONS.EU,
      JURISDICTIONS.ES,
      JURISDICTIONS.AND,
      JURISDICTIONS.SE_PROV,
      JURISDICTIONS.DOS_HERMANAS,
    ];
    const snap = buildRegulatorySnapshot({
      jurisdictionChain: dosHermanas,
      topics: ["planning", "zoning", "licence", "tax.works", "tax.exit"],
      analysisDate: "2026-01-15",
    });
    // The PGOU of Dos Hermanas is registered (planning, zoning); its ordinances are not.
    expect(snap.entries.map((e) => e.regulationId)).toContain("reg.es.doshermanas.pgou-2002");
    expect(snap.gaps.map((g) => g.topic).sort()).toEqual(["licence", "tax.works"]);
    expect(snap.gaps[0]?.note).toContain("Dos Hermanas");
    const sevilla = buildRegulatorySnapshot({
      jurisdictionChain: chain,
      topics: ["planning", "zoning", "licence", "tax.works"],
      analysisDate: "2026-01-15",
    });
    expect(sevilla.gaps).toEqual([]);
  });
  it("same query → same fingerprint", () => {
    const a = buildRegulatorySnapshot({
      jurisdictionChain: chain,
      topics: ["tax.exit"],
      analysisDate: "2026-01-15",
    });
    const b = buildRegulatorySnapshot({
      jurisdictionChain: chain,
      topics: ["tax.exit"],
      analysisDate: "2026-01-15",
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe("watcher", () => {
  const snap = buildRegulatorySnapshot({
    jurisdictionChain: chain,
    topics: ["tax.acquisition", "change_of_use"],
    analysisDate: "2026-01-15",
  });
  const analyses = [
    {
      dealId: "d1",
      dealLabel: "Local Triana",
      snapshot: snap,
      strategies: [
        { strategyId: "change_of_use", label: "Cambio de uso", topics: ["change_of_use" as const] },
      ],
    },
    {
      dealId: "d2",
      dealLabel: "Piso Nervión",
      snapshot: buildRegulatorySnapshot({
        jurisdictionChain: chain,
        topics: ["tenancy"],
        analysisDate: "2026-01-15",
      }),
      strategies: [],
    },
    {
      dealId: "d3",
      dealLabel: "Casa Madrid",
      snapshot: buildRegulatorySnapshot({
        jurisdictionChain: [JURISDICTIONS.ES],
        topics: ["tax.acquisition"],
        analysisDate: "2026-01-15",
      }),
      strategies: [],
    },
  ];
  it("classifies impacts and writes the headline", () => {
    const reg = findRegulation("reg.es.and.tributos-cedidos.ley5-2021")!;
    const report = assessRegulatoryChange(
      {
        regulationId: reg.id,
        shortName: reg.shortName,
        newVersion: { ...reg.versions[0]!, version: "2027", effectiveFrom: "2027-01-01" },
        jurisdiction: reg.jurisdiction,
        topics: reg.topics,
      },
      analyses,
    );
    expect(report.analysed).toBe(3);
    expect(report.impacts.find((i) => i.dealId === "d1")?.level).toBe("recalculate");
    expect(report.impacts.find((i) => i.dealId === "d2")?.level).toBe("unaffected");
    expect(report.impacts.find((i) => i.dealId === "d3")?.level).toBe("unaffected");
    expect(report.headline).toContain("3 análisis revisados");
  });
});
