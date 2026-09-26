import { describe, expect, it } from "vitest";
import { buildArcGisQueryUrl, esriCentroid, parseArcGisFeatures, queryArcGisLayer } from "./arcgis";
import { queryLayer } from "./index";
import { buildWfsQueryUrl, geoJsonCentroid, parseGeoJsonFeatures } from "./wfs";

const mockFetch = (body: unknown, status = 200): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

describe("ArcGIS REST client", () => {
  it("builds a point-in-polygon query with base where and escaped literals", () => {
    const url = new URL(
      buildArcGisQueryUrl(
        "https://host/arcgis/rest/services/X/MapServer/1/",
        {
          point: { lat: 37.38, lng: -5.99 },
          equals: { field: "REF_CAT", value: "42'19" },
          returnGeometry: true,
        },
        "FECHA_HIST IS NULL",
      ),
    );
    expect(url.pathname).toBe("/arcgis/rest/services/X/MapServer/1/query");
    expect(url.searchParams.get("where")).toBe("(FECHA_HIST IS NULL) AND REF_CAT = '42''19'");
    expect(url.searchParams.get("geometry")).toBe("-5.99,37.38");
    expect(url.searchParams.get("inSR")).toBe("4326");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("json");
  });
  it("parses features and polygon centroids, and surfaces the service error envelope", () => {
    const parsed = parseArcGisFeatures({
      features: [
        {
          attributes: { clase_cat: "MC" },
          geometry: {
            rings: [
              [
                [-6, 37],
                [-5, 37],
                [-5, 38],
                [-6, 38],
              ],
            ],
          },
        },
        { attributes: { clase_cat: "CH" } },
      ],
    });
    expect(parsed[0]?.attributes.clase_cat).toBe("MC");
    expect(parsed[0]?.centroid).toEqual({ lng: -5.5, lat: 37.5 });
    expect(parsed[1]?.centroid).toBeUndefined();
    expect(esriCentroid({ x: 1, y: 2 })).toEqual({ lng: 1, lat: 2 });
    expect(() => parseArcGisFeatures({ error: { code: 400, message: "Invalid query" } })).toThrow(
      /ArcGIS error 400/,
    );
  });
  it("queries through fetch and rejects HTTP failures", async () => {
    const ok = await queryArcGisLayer(
      "https://host/MapServer/0",
      { point: { lat: 1, lng: 2 } },
      { fetchImpl: mockFetch({ features: [{ attributes: { a: 1 } }] }) },
    );
    expect(ok.features).toHaveLength(1);
    expect(ok.url).toContain("/MapServer/0/query?");
    await expect(
      queryArcGisLayer("https://host/MapServer/0", {}, { fetchImpl: mockFetch({}, 503) }),
    ).rejects.toThrow(/HTTP 503/);
  });
});

describe("WFS client", () => {
  it("builds a GetFeature with CQL INTERSECTS and equality", () => {
    const url = new URL(
      buildWfsQueryUrl(
        "https://host/geoserver/wfs",
        "urb:calificacion",
        { point: { lat: 37.38, lng: -5.99 }, equals: { field: "refcat", value: "A" } },
        { geometryField: "the_geom", cqlFilter: "vigente = true" },
      ),
    );
    expect(url.searchParams.get("typeNames")).toBe("urb:calificacion");
    expect(url.searchParams.get("outputFormat")).toBe("application/json");
    expect(url.searchParams.get("CQL_FILTER")).toBe(
      "(vigente = true) AND refcat = 'A' AND INTERSECTS(the_geom, POINT(-5.99 37.38))",
    );
  });
  it("parses GeoJSON features and centroids", () => {
    const parsed = parseGeoJsonFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { nivel: "B" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-6, 37],
                [-5, 37],
                [-5, 38],
                [-6, 38],
              ],
            ],
          },
        },
      ],
    });
    expect(parsed[0]?.attributes.nivel).toBe("B");
    expect(parsed[0]?.centroid).toEqual({ lng: -5.5, lat: 37.5 });
    expect(geoJsonCentroid({ type: "Point", coordinates: [1, 2] })).toEqual({ lng: 1, lat: 2 });
    expect(() => parseGeoJsonFeatures({ exceptions: [{ text: "bad" }] })).toThrow(/WFS exception/);
  });
  it("dispatches by protocol", async () => {
    const r = await queryLayer(
      { kind: "wfs", url: "https://host/wfs", typeName: "a:b" },
      { point: { lat: 1, lng: 2 } },
      { fetchImpl: mockFetch({ type: "FeatureCollection", features: [] }) },
    );
    expect(r.url).toContain("request=GetFeature");
  });
});
