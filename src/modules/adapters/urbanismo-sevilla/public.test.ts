import { describe, expect, it } from "vitest";
import { defaultCity } from "@/modules/city/registry";
import { mergePlanningConfig, parsePlanningConfigOverride } from "./public-config";
import { matchZoningCatalogue, normaliseProtection, truthy, UrbanismoPublicConnector } from "./public";

const ring = [
  [-5.997, 37.382],
  [-5.995, 37.382],
  [-5.995, 37.384],
  [-5.997, 37.384],
];

/** Fake IDE Sevilla: answers by URL pattern with ArcGIS-shaped payloads mirroring the real layers. */
function fakeIde(overrides: Partial<Record<string, unknown | (() => Response)>> = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    for (const [pattern, body] of Object.entries(overrides)) {
      if (url.includes(pattern)) return typeof body === "function" ? (body as () => Response)() : json(body);
    }
    if (url.includes("PARCELA_2024_01_20"))
      return json({
        features: [
          {
            attributes: {
              refcat: "4219020TG3441N",
              barrio: "Triana Casco Antiguo",
              distrito_n: "Triana",
              vut: "Barrio saturado",
            },
            geometry: { rings: [ring] },
          },
        ],
      });
    if (url.includes("Info_Urban_2025_help/FeatureServer/57"))
      return json({
        features: [{ attributes: { codigo: "SUC", clase: "Suelo Urbano", sub_cat: "Consolidado" } }],
      });
    if (url.includes("Info_Urban_2025_help/FeatureServer/56"))
      return json({
        features: [
          {
            attributes: {
              clase_cat: "MC",
              zona_orden: "Manzana",
              u_global: "Residencial",
              altura: 4,
              det_comple: null,
              conjunto_h: "SI",
              catalogo: "C",
              ficha: "https://sig.urbanismosevilla.org/ficha/123",
              enlace_np: "https://sig.urbanismosevilla.org/np/mc",
            },
          },
        ],
      });
    if (url.includes("MapServer/19"))
      return json({
        features: [
          {
            attributes: {
              sector: "14",
              nombre: "Triana",
              planeamien: "PEP",
              estado: "Aprobado definitivamente",
            },
          },
        ],
      });
    if (url.includes("MapServer/16")) return json({ features: [] });
    if (url.includes("MapServer/18"))
      return json({
        features: [{ attributes: { denominaci: "Capilla del Carmen", tipologia: "Monumento" } }],
      });
    if (url.includes("MapServer/29")) return json({ features: [] });
    if (url.includes("MapServer/33"))
      return json({
        features: [{ attributes: { afecciones: "Servidumbre aeronáutica", url: "https://x" } }],
      });
    if (url.includes("VUT_Barrios_saturados"))
      return json({ features: [{ attributes: { vut: "Saturado", barrio: "Triana" } }] });
    if (url.includes("MapServer/8")) return json({ features: [] });
    return json({ error: { code: 404, message: "unknown layer" } }, 200);
  }) as typeof fetch;
}

const point = { lat: 37.383, lng: -5.996 };

describe("UrbanismoPublicConnector", () => {
  it("builds a verified PlanningInfo from the public layers with one evidence per layer", async () => {
    const c = new UrbanismoPublicConnector(defaultCity(), null, fakeIde());
    const r = await c.query({ point, cadastralRef: "4219020TG3441N", address: "Calle Pureza 45" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.value.data;
    expect(r.value.mode).toBe("public");
    expect(p.zoningCode).toBe("MC");
    expect(p.zoningLabel).toBe("Manzana");
    expect(p.maxFloors).toBe(4); // layer value wins over the catalogue default
    expect(p.groundFloorResidential).toBe("conditioned"); // from the city catalogue (MC)
    expect(p.allowedUses).toEqual(["Residencial"]);
    expect(p.inHistoricCentre).toBe(true);
    expect(p.heritageSector).toBe("14 · Triana");
    expect(p.protectionLevel).toBe("C"); // catalogue field of the zoning polygon
    expect(p.catalogued).toBe(true);
    expect(p.touristSaturation).toBe("saturated");
    expect(p.neighbourhood).toBe("Triana");
    expect(
      p.conditionedUses.some((u) =>
        u.startsWith("Vivienda de uso turístico: barrio saturado según la capa municipal (Triana)"),
      ),
    ).toBe(true);
    expect(p.conditionedUses.some((u) => u.includes("entorno de BIC"))).toBe(true);
    expect(p.notes[0]).toContain("Clasificación del suelo: Suelo Urbano · Consolidado");
    expect(p.notes.some((n) => n.includes("Afección sectorial: Servidumbre aeronáutica"))).toBe(true);
    expect(p.notes.some((n) => n.includes("Ficha de catálogo"))).toBe(true);
    expect(p.status).toBe("VERIFIED");
    expect(r.value.evidence).toHaveLength(c.layers().length);
    expect(r.value.evidence.every((e) => e.demo === false && e.sourceType === "official_planning")).toBe(
      true,
    );
    expect(r.value.evidence[0]?.sourceUrl).toContain("/query?");
  });
  it("resolves the point from the cadastral reference through the parcel layer", async () => {
    const c = new UrbanismoPublicConnector(defaultCity(), null, fakeIde());
    const r = await c.query({ cadastralRef: "4219020TG3441N0001AB" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.evidence.some((e) => e.sourceName.includes("Parcelario"))).toBe(true);
    expect(r.value.evidence.find((e) => e.sourceName.includes("Parcelario"))?.sourceUrl).toContain(
      "refcat+%3D+%274219020TG3441N%27",
    );
    expect(r.value.data.zoningCode).toBe("MC");
  });
  it("marks a BIC parcel and falls back to unknown protection outside catalogue coverage", async () => {
    const bic = new UrbanismoPublicConnector(
      defaultCity(),
      null,
      fakeIde({
        "MapServer/16": {
          features: [{ attributes: { denominaci: "Casa de Pilatos", tipologia: "Monumento" } }],
        },
      }),
    );
    const r = await bic.query({ point });
    expect(r.ok && r.value.data.protectionLevel).toBe("BIC");
    const noCatalogue = new UrbanismoPublicConnector(
      defaultCity(),
      null,
      fakeIde({
        "Info_Urban_2025_help/FeatureServer/56": {
          features: [
            { attributes: { clase_cat: "CH", zona_orden: "Centro Histórico", altura: 3, conjunto_h: "SI" } },
          ],
        },
      }),
    );
    const r2 = await noCatalogue.query({ point });
    expect(r2.ok && r2.value.data.protectionLevel).toBe("unknown");
    expect(r2.ok && r2.value.data.zoningLabel).toBe("Centro Histórico");
  });
  it("degrades to INFERRED when a layer fails and to an error when none answers", async () => {
    const partial = new UrbanismoPublicConnector(
      defaultCity(),
      null,
      fakeIde({ VUT_Barrios_saturados: () => new Response("boom", { status: 500 }) }),
    );
    const r = await partial.query({ point });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.data.status).toBe("INFERRED");
    expect(
      r.value.data.notes.some((n) =>
        n.includes("Vivienda de uso turístico: el servicio público no ha respondido"),
      ),
    ).toBe(true);
    expect(r.value.evidence).toHaveLength(partial.layers().length - 1);

    const down = new UrbanismoPublicConnector(
      defaultCity(),
      null,
      (async () => new Response("x", { status: 503 })) as typeof fetch,
    );
    const d = await down.query({ point });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.error.code).toBe("SOURCE_UNAVAILABLE");
  });
  it("refuses a query without point or resolvable cadastral reference", async () => {
    const c = new UrbanismoPublicConnector(defaultCity(), null, fakeIde());
    const r = await c.query({ address: "Calle Pureza 45" });
    expect(r.ok).toBe(false);
  });
  it("applies URBANISMO_PUBLIC_CONFIG overrides layer by layer", () => {
    const base = defaultCity().urbanism.publicSources!;
    const override = parsePlanningConfigOverride(
      JSON.stringify({
        zoning: {
          label: "Calif",
          source: { kind: "wfs", url: "https://x/wfs", typeName: "a:b" },
          fields: { code: "ord" },
        },
        touristSaturation: null,
      }),
    );
    const merged = mergePlanningConfig(base, override);
    expect(merged.zoning?.source.kind).toBe("wfs");
    expect(merged.touristSaturation).toBeUndefined();
    expect(merged.classification).toBe(base.classification);
    expect(parsePlanningConfigOverride("")).toBeNull();
  });
  it("normalises protection levels, flags and ordinance labels", () => {
    const cov = { configured: true, answered: true };
    expect(normaliseProtection("Nivel B", cov)).toBe("B");
    expect(normaliseProtection("Protección integral", cov)).toBe("A");
    expect(normaliseProtection("BIC Monumento", cov)).toBe("BIC");
    expect(normaliseProtection(undefined, cov)).toBe("none");
    expect(normaliseProtection("NO", cov)).toBe("none");
    expect(normaliseProtection("X", { configured: false, answered: true })).toBe("unknown");
    expect(truthy("SI")).toBe(true);
    expect(truthy("NO")).toBe(false);
    expect(truthy(undefined)).toBeUndefined();
    const city = defaultCity();
    expect(matchZoningCatalogue(city, "MC", undefined)?.key).toBe("MC");
    expect(matchZoningCatalogue(city, "EA-2", undefined)?.key).toBe("EA");
    expect(matchZoningCatalogue(city, "", "Zona Centro Histórico")?.key).toBe("CH");
    expect(matchZoningCatalogue(city, "ZZ", "otra cosa")).toBeUndefined();
  });
});

describe("UrbanismoPublicConnector — publisher quirks", () => {
  it("ignores sentinel heights, prefers filled features and retries with tolerance", async () => {
    let zoningCalls = 0;
    const c = new UrbanismoPublicConnector(
      defaultCity(),
      null,
      fakeIde({
        "Info_Urban_2025_help/FeatureServer/56": () => {
          zoningCalls++;
          const body =
            zoningCalls === 1
              ? { features: [] }
              : {
                  features: [
                    { attributes: { clase_cat: null, zona_orden: null, altura: null, conjunto_h: null } },
                    {
                      attributes: {
                        clase_cat: "CH",
                        zona_orden: "Centro Histórico",
                        altura: 88,
                        altura_max: "Según PEP",
                        conjunto_h: "SI",
                        catalogo: "D",
                      },
                    },
                  ],
                };
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
        "Info_Urban_2025_help/FeatureServer/57": {
          features: [
            { attributes: { codigo: "Z", clase: "", sub_cat: "", cla_cat: "Suelo Urbano_Representación" } },
            { attributes: { codigo: "SUC", clase: "Suelo Urbano", sub_cat: "Consolidado", cla_cat: "SUC" } },
          ],
        },
      }),
    );
    const r = await c.query({ point });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(zoningCalls).toBe(2);
    const p = r.value.data;
    expect(p.zoningCode).toBe("CH");
    expect(p.maxFloors).toBeNull(); // 88 is a pointer to the catalogue, never a height; nothing is assumed
    expect(
      p.notes.some((n) => n.includes("valor publicado 88") && n.includes("no se asume ninguna altura")),
    ).toBe(true);
    expect(p.protectionLevel).toBe("D");
    expect(p.notes[0]).toBe("Clasificación del suelo: Suelo Urbano · Consolidado.");
    expect(p.notes.some((n) => n.includes("Catálogo de protección: capa no configurada"))).toBe(false);
    const zoningEvidence = r.value.evidence.find((e) => e.sourceName.includes("Calificación"));
    expect(zoningEvidence?.sourceUrl).toContain("distance=8");
  });
});
