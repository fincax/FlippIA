import type { LatLng } from "@/modules/city/types";
import type { FeatureRecord, GeoClientOptions, GeoQuery, GeoQueryResult } from "./types";

const DEFAULT_TIMEOUT_MS = 8_000;

/** Escape a literal for an ArcGIS `where` clause. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Build the `query` URL of an ArcGIS REST layer (MapServer or FeatureServer). */
export function buildArcGisQueryUrl(layerUrl: string, q: GeoQuery, baseWhere?: string): string {
  const base = layerUrl.replace(/\/+$/, "");
  const p = new URLSearchParams();
  p.set("f", "json");
  p.set("outFields", "*");
  p.set("returnGeometry", q.returnGeometry ? "true" : "false");
  if (q.returnGeometry) p.set("outSR", "4326");
  const where: string[] = [];
  if (baseWhere) where.push(`(${baseWhere})`);
  if (q.equals) where.push(`${q.equals.field} = ${sqlLiteral(q.equals.value)}`);
  p.set("where", where.length ? where.join(" AND ") : "1=1");
  if (q.point) {
    p.set("geometry", `${q.point.lng},${q.point.lat}`);
    p.set("geometryType", "esriGeometryPoint");
    p.set("inSR", "4326");
    p.set("spatialRel", "esriSpatialRelIntersects");
  }
  if (q.maxFeatures) p.set("resultRecordCount", String(q.maxFeatures));
  return `${base}/query?${p.toString()}`;
}

type Obj = Record<string, unknown>;

/** Centroid of an esri geometry (point, polygon rings or polyline paths) in the geometry's SR. */
export function esriCentroid(geometry: unknown): LatLng | undefined {
  if (!geometry || typeof geometry !== "object") return undefined;
  const g = geometry as Obj;
  if (typeof g.x === "number" && typeof g.y === "number") return { lng: g.x, lat: g.y };
  const parts = (g.rings ?? g.paths) as unknown;
  if (!Array.isArray(parts) || !Array.isArray(parts[0])) return undefined;
  const ring = parts[0] as unknown[];
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const pt of ring) {
    if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
      sx += pt[0];
      sy += pt[1];
      n++;
    }
  }
  return n ? { lng: sx / n, lat: sy / n } : undefined;
}

/** Parse an ArcGIS REST `query` response. Throws on the service's own error envelope. */
export function parseArcGisFeatures(json: unknown): FeatureRecord[] {
  const root = (json ?? {}) as Obj;
  if (root.error && typeof root.error === "object") {
    const e = root.error as Obj;
    throw new Error(`ArcGIS error ${String(e.code ?? "")}: ${String(e.message ?? "unknown")}`);
  }
  const features = Array.isArray(root.features) ? (root.features as unknown[]) : [];
  return features.map((f) => {
    const o = (f ?? {}) as Obj;
    const attributes = (o.attributes && typeof o.attributes === "object" ? o.attributes : {}) as Record<
      string,
      unknown
    >;
    const centroid = esriCentroid(o.geometry);
    return centroid ? { attributes, centroid } : { attributes };
  });
}

export async function queryArcGisLayer(
  layerUrl: string,
  q: GeoQuery,
  opts: GeoClientOptions & { where?: string } = {},
): Promise<GeoQueryResult> {
  const url = buildArcGisQueryUrl(layerUrl, q, opts.where);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    return { features: parseArcGisFeatures(json), url };
  } finally {
    clearTimeout(t);
  }
}

/** Describe an ArcGIS REST node (service directory, service or layer) for discovery tools. */
export async function describeArcGis(url: string, opts: GeoClientOptions = {}): Promise<Obj> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetchImpl(`${url}${sep}f=json`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as Obj;
    if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
    return json;
  } finally {
    clearTimeout(t);
  }
}
