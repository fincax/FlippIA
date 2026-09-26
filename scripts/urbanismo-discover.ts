import "dotenv/config";
import { describeArcGis } from "@/modules/adapters/geoservices/arcgis";
import { defaultCity } from "@/modules/city/registry";

/**
 * Walks the public ArcGIS REST directories of a planning authority and prints
 * every layer whose name or fields match planning keywords, so the
 * `publicSources` mapping of a city can be verified or updated.
 *
 *   pnpm urbanismo:discover                         # roots from the city profile
 *   pnpm urbanismo:discover https://host/arcgis/rest/services
 *   pnpm urbanismo:discover <layer url>             # prints the fields of one layer
 */
const KEYWORDS =
  /calif|clasif|catalog|protec|conjunto|ordenan|altura|plant|vut|turist|planeam|parcel|ref_cat|refcat|catastr|bic|sector/i;

type Obj = Record<string, unknown>;

async function walkServices(root: string, seen = new Set<string>()): Promise<void> {
  if (seen.has(root)) return;
  seen.add(root);
  let dir: Obj;
  try {
    dir = await describeArcGis(root, { timeoutMs: 15_000 });
  } catch (e) {
    console.warn(`  ! ${root}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  for (const f of (dir.folders as string[] | undefined) ?? []) await walkServices(`${root}/${f}`, seen);
  for (const s of (dir.services as Array<{ name: string; type: string }> | undefined) ?? []) {
    if (s.type !== "MapServer" && s.type !== "FeatureServer") continue;
    const name = s.name.includes("/") ? s.name.split("/").pop()! : s.name;
    const serviceUrl = `${root.replace(/\/[^/]+$/, (m) => (dir.folders ? m : m))}/${name}/${s.type}`.replace(
      /\/services\/(.+)\/services\//,
      "/services/",
    );
    await describeService(serviceUrl.includes("/services/") ? serviceUrl : `${root}/${name}/${s.type}`);
  }
}

async function describeService(url: string): Promise<void> {
  let svc: Obj;
  try {
    svc = await describeArcGis(url, { timeoutMs: 15_000 });
  } catch {
    return;
  }
  const layers = ((svc.layers as Array<{ id: number; name: string }> | undefined) ?? []).concat(
    (svc.tables as Array<{ id: number; name: string }> | undefined) ?? [],
  );
  for (const l of layers) {
    if (!KEYWORDS.test(l.name) && !KEYWORDS.test(url)) continue;
    await describeLayer(`${url}/${l.id}`);
  }
}

async function describeLayer(url: string): Promise<void> {
  try {
    const layer = await describeArcGis(url, { timeoutMs: 15_000 });
    const fields = (
      (layer.fields as Array<{ name: string; type: string; alias?: string }> | undefined) ?? []
    ).map(
      (f) =>
        `${f.name}${f.alias && f.alias !== f.name ? ` (${f.alias})` : ""}: ${String(f.type).replace("esriFieldType", "")}`,
    );
    const hit = fields.some((f) => KEYWORDS.test(f)) || KEYWORDS.test(String(layer.name));
    if (!hit) return;
    console.warn(
      `\n${url}\n  ${String(layer.name)} · ${String(layer.geometryType ?? layer.type)} · SR ${JSON.stringify(
        (layer.extent as Obj | undefined)?.spatialReference ?? layer.sourceSpatialReference ?? "?",
      )}`,
    );
    for (const f of fields) console.warn(`    - ${f}`);
  } catch (e) {
    console.warn(`  ! ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const city = defaultCity();
  const configured = Object.values(city.urbanism.publicSources ?? {})
    .map((v) =>
      v && typeof v === "object" && "source" in v ? (v as { source: { url: string } }).source.url : null,
    )
    .filter((u): u is string => Boolean(u));
  const roots = args.length
    ? args
    : [...new Set(configured.map((u) => u.replace(/\/rest\/services\/.*$/, "/rest/services")))];
  console.warn(`Descubrimiento de capas de planeamiento (${roots.length} raíces)`);
  for (const r of roots) {
    if (/\/(MapServer|FeatureServer)\/\d+$/.test(r)) await describeLayer(r);
    else if (/\/(MapServer|FeatureServer)$/.test(r)) await describeService(r);
    else await walkServices(r);
  }
  console.warn("\nCapas configuradas actualmente:");
  for (const u of configured) console.warn(`  - ${u}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
