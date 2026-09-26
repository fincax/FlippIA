import { describe, expect, it } from "vitest";
import { defaultCity } from "@/modules/city/registry";
import { mergePlanningConfig, parsePlanningConfigOverride } from "./public-config";
import { normaliseProtection, UrbanismoPublicConnector } from "./public";

/** Fake IDE: answers by URL pattern with ArcGIS-shaped payloads. */
function fakeIde(overrides: Partial<Record<string, unknown | (() => Response)>> = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    for (const [pattern, body] of Object.entries(overrides)) {
      if (url.includes(pattern)) return typeof body === "function" ? (body as () => Response)() : json(body);
    }
    if (url.includes("Pla_Sit_POI"))
      return json({
        features: [
          {
            attributes: { REF_CAT: "4219020TG3441N" },
            geometry: {
              rings: [
                [
                  [-5.997, 37.382],
                  [-5.995, 37.382],
                  [-5.995, 37.384],
                  [-5.997, 37.384],
                ],
              ],
            },
          },
        ],
      });
    if (url.includes("Guia_Urbana_2026"))
      return json({
        features: [{ attributes: { clase: "Urbano", sub_cat: "Consolidado", cla_cat: "SUC" } }],
      });
    if (url.includes("Prueba_PGOU_para_Dashboard"))
      return json({ features: [{ attributes: { clase_cat: "MC" } }] });
    if (url.includes("VUT_Barrios_saturados"))
      return json({ features: [{ attributes: { vut: "Saturado", distrito: "Triana" } }] });
    if (url.includes("MIL1")) return json({ features: [] });
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
    expect(p.zoningLabel).toBe("Manzana Cerrada");
    expect(p.maxFloors).toBe(5);
    expect(p.groundFloorResidential).toBe("conditioned");
    expect(p.notes[0]).toContain("Clasificación del suelo: Urbano · Consolidado");
    expect(p.conditionedUses.some((u) => u.includes("Vivienda de uso turístico: Saturado (Triana)"))).toBe(
      true,
    );
    expect(p.protectionLevel).toBe("unknown"); // catalogue layer not configured
    expect(p.inHistoricCentre).toBe(true); // microzone fallback (Triana)
    expect(p.status).toBe("VERIFIED");
    expect(r.value.evidence).toHaveLength(4);
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
    expect(r.value.data.zoningCode).toBe("MC");
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
    expect(r.value.evidence).toHaveLength(3);

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
    expect(() => parsePlanningConfigOverride("[]")).not.toThrow();
  });
  it("normalises protection levels", () => {
    const cov = { configured: true, answered: true };
    expect(normaliseProtection("Nivel B", cov)).toBe("B");
    expect(normaliseProtection("Protección integral", cov)).toBe("A");
    expect(normaliseProtection("BIC Monumento", cov)).toBe("BIC");
    expect(normaliseProtection(undefined, cov)).toBe("none");
    expect(normaliseProtection("X", { configured: false, answered: true })).toBe("unknown");
    expect(normaliseProtection("B", { configured: true, answered: false })).toBe("unknown");
  });
});
