import "dotenv/config";
import { createMarketAdapter, CompositeMarketAdapter } from "@/modules/adapters/market";
import { defaultCity, microzoneFromPoint, microzoneFromText } from "@/modules/city/registry";

/**
 * Runs the configured market source(s) for one location and prints what the
 * valuation would receive:
 *
 *   pnpm market:check 37.3826,-5.9963
 *   pnpm market:check "Triana" --area 90 --use commercial
 *
 * Uses MARKET_SOURCE_MODE and the Idealista credentials from .env. Own
 * comparables are tenant-scoped and need a session, so this script only
 * exercises the shared providers (Idealista, DEMO).
 */
async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]?.startsWith("--")));
  const text = positional.join(" ").trim();
  if (!text)
    throw new Error(
      'Uso: pnpm market:check "<lat,lng | texto de microzona>" [--area 90] [--use residential]',
    );
  const city = defaultCity();
  const pointMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  const point = pointMatch ? { lat: Number(pointMatch[1]), lng: Number(pointMatch[2]) } : undefined;
  const zone = point ? microzoneFromPoint(city, point) : microzoneFromText(city, text);
  if (!zone) throw new Error("No se reconoce la microzona.");
  const use = flag("use") ?? "residential";
  const assetUse = use === "commercial" || use === "office" || use === "other" ? use : "residential";
  const areaM2 = Number(flag("area") ?? 90);
  const adapter = createMarketAdapter();
  const providers =
    adapter instanceof CompositeMarketAdapter
      ? adapter.providers.map((p) => p.sourceName)
      : [adapter.sourceName];
  console.warn(
    `Modo MARKET_SOURCE_MODE=${process.env.MARKET_SOURCE_MODE ?? "demo"} → ${providers.join(" + ")}`,
  );
  console.warn(
    `Microzona ${zone.name} (${zone.id}) · ${assetUse} · ${areaM2} m² · ${point ? `${point.lat},${point.lng}` : "centroide"}`,
  );
  const r = await adapter.query({
    microzoneId: zone.id,
    point,
    assetUse,
    areaM2,
    analysisDate: new Date().toISOString().slice(0, 10),
  });
  if (!r.ok) {
    console.error(`✗ ${r.error.code}: ${r.error.message}`);
    process.exitCode = 1;
    return;
  }
  const d = r.value.data;
  console.warn(
    `${d.demo ? "DEMO" : "✓ real"} · ${d.comparablesSale.length} venta · ${d.comparablesRent.length} alquiler · ${r.value.evidence.length} evidencias`,
  );
  console.warn(
    `Stats: reformado ${d.stats.renovatedPerM2} €/m² · sin reformar ${d.stats.unrenovatedPerM2} €/m² · alquiler ${d.stats.rentPerM2Month} €/m²/mes · liquidez ${d.stats.liquidity} (${d.stats.daysToSell} días, ${d.stats.liquidityBasis ?? "demo"})`,
  );
  console.warn(`Nota: ${d.stats.confidenceNote}`);
  for (const s of d.sources ?? [])
    console.warn(`  fuente ${s.name}: ${s.sale} venta / ${s.rent} alquiler${s.demo ? " (DEMO)" : ""}`);
  for (const c of d.comparablesSale.slice(0, 15))
    console.warn(
      `  venta ${c.type.padEnd(11)} ${String(c.price).padStart(9)} € ${String(c.areaM2).padStart(4)} m² ${String(c.distanceM).padStart(5)} m ${c.condition.padEnd(11)} ${c.label ?? ""}${c.demo ? " [DEMO]" : ""}`,
    );
  for (const c of d.comparablesRent.slice(0, 8))
    console.warn(
      `  alquiler ${c.type.padEnd(11)} ${String(c.monthlyRent).padStart(6)} €/mes ${String(c.areaM2).padStart(4)} m² ${String(c.distanceM).padStart(5)} m ${c.label ?? ""}${c.demo ? " [DEMO]" : ""}`,
    );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
