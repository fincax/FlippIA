import type { LatLng } from "@/modules/city/types";
import type { FeatureRecord, GeoClientOptions, GeoQuery, GeoQueryResult } from "./types";

const DEFAULT_TIMEOUT_MS = 8_000;

/** Escape a literal for a CQL predicate. */
export function cqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Build a WFS 2.0 GetFeature URL with GeoJSON output and CQL filters (GeoServer dialect). */
export function buildWfsQueryUrl(
  serviceUrl: string,
  typeName: string,
  q: GeoQuery,
  opts: { geometryField?: string; cqlFilter?: string } = {},
): string {
  const p = new URLSearchParams();
  p.set("service", "WFS");
  p.set("version", "2.0.0");
  p.set("request", "GetFeature");
  p.set("typeNames", typeName);
  p.set("outputFormat", "application/json");
  p.set("srsName", "EPSG:4326");
  if (q.maxFeatures) p.set("count", String(q.maxFeatures));
  const filters: string[] = [];
  if (opts.cqlFilter) filters.push(`(${opts.cqlFilter})`);
  if (q.equals) filters.push(`${q.equals.field} = ${cqlLiteral(q.equals.value)}`);
  if (q.point)
    filters.push(
      q.distanceM
        ? `DWITHIN(${opts.geometryField ?? "geom"}, POINT(${q.point.lng} ${q.point.lat}), ${q.distanceM}, meters)`
        : `INTERSECTS(${opts.geometryField ?? "geom"}, POINT(${q.point.lng} ${q.point.lat}))`,
    );
  if (filters.length) p.set("CQL_FILTER", filters.join(" AND "));
  const sep = serviceUrl.includes("?") ? "&" : "?";
  return `${serviceUrl}${sep}${p.toString()}`;
}

type Obj = Record<string, unknown>;

/** Centroid of a GeoJSON geometry (Point, Polygon, MultiPolygon, LineString). */
export function geoJsonCentroid(geometry: unknown): LatLng | undefined {
  if (!geometry || typeof geometry !== "object") return undefined;
  const g = geometry as Obj;
  const coords = g.coordinates as unknown;
  const pts: number[][] = [];
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") pts.push(c as number[]);
    else for (const x of c) walk(x);
  };
  walk(coords);
  if (!pts.length) return undefined;
  const sx = pts.reduce((a, p) => a + (p[0] ?? 0), 0);
  const sy = pts.reduce((a, p) => a + (p[1] ?? 0), 0);
  return { lng: sx / pts.length, lat: sy / pts.length };
}

export function parseGeoJsonFeatures(json: unknown): FeatureRecord[] {
  const root = (json ?? {}) as Obj;
  if (root.exceptions || (typeof root.type === "string" && /exception/i.test(root.type)))
    throw new Error(`WFS exception: ${JSON.stringify(root.exceptions ?? root)}`);
  const features = Array.isArray(root.features) ? (root.features as unknown[]) : [];
  return features.map((f) => {
    const o = (f ?? {}) as Obj;
    const attributes = (o.properties && typeof o.properties === "object" ? o.properties : {}) as Record<
      string,
      unknown
    >;
    const centroid = geoJsonCentroid(o.geometry);
    return centroid ? { attributes, centroid } : { attributes };
  });
}

export async function queryWfsLayer(
  serviceUrl: string,
  typeName: string,
  q: GeoQuery,
  opts: GeoClientOptions & { geometryField?: string; cqlFilter?: string } = {},
): Promise<GeoQueryResult> {
  const url = buildWfsQueryUrl(serviceUrl, typeName, q, opts);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    return { features: parseGeoJsonFeatures(json), url };
  } finally {
    clearTimeout(t);
  }
}
