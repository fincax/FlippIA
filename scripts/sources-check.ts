import "dotenv/config";
import { buildUrl, CatastroPublicAdapter } from "@/modules/adapters/catastro/public";
import type { CatastroQuery } from "@/modules/adapters/catastro/types";
import { queryLayer } from "@/modules/adapters/geoservices";
import { buildNumereroUrl } from "@/modules/adapters/catastro/public";
import { UrbanismoPublicConnector } from "@/modules/adapters/urbanismo-sevilla/public";
import { parseIntake } from "@/modules/property/intake";

/**
 * End-to-end check of the free public sources for one property, independent of
 * the environment's *_MODE settings:
 *
 *   pnpm sources:check "Calle Pureza 45, Sevilla"
 *   pnpm sources:check 4219020TG3441N
 *   pnpm sources:check 37.3826,-5.9963
 *
 * Prints every request URL and, when a source answers nothing, the raw body so
 * the parser can be adjusted without guessing.
 */
async function main() {
  const text = process.argv.slice(2).join(" ").trim();
  if (!text) throw new Error('Uso: pnpm sources:check "<dirección | referencia catastral | lat,lng>"');
  const urbanism = new UrbanismoPublicConnector();
  const parcel = urbanism.config.parcel;
  const catastro = new CatastroPublicAdapter(fetch, async (pt) => {
    if (!parcel?.fields.cadastralRef) return undefined;
    const r = await queryLayer(
      parcel.source,
      { point: pt, maxFeatures: 1, distanceM: 8 },
      { timeoutMs: 10_000 },
    );
    const v = r.features[0]?.attributes[parcel.fields.cadastralRef];
    console.warn(`   parcelario municipal por punto: ${v ? String(v) : "sin parcela"} (${r.url})`);
    return v ? String(v).toUpperCase() : undefined;
  });
  const point = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  const rc = text.match(/^[0-9A-Z]{14}([0-9A-Z]{6})?$/i);
  const intake = parseIntake(text);
  const query: CatastroQuery = point
    ? { kind: "point", point: { lat: Number(point[1]), lng: Number(point[2]) } }
    : rc
      ? {
          kind: "cadastralRef",
          cadastralRef: text.toUpperCase(),
          municipality: "SEVILLA",
          province: "SEVILLA",
        }
      : {
          kind: "address",
          municipality: "SEVILLA",
          province: "SEVILLA",
          street:
            (intake.property?.address ?? text)
              .replace(/\d.*$/, "")
              .replace(/^(calle|c\/|avenida|avda\.?|plaza)\s+/i, "")
              .replace(/,.*$/, "")
              .trim() || text,
          number: text.match(/\d{1,4}/)?.[0] ?? "1",
        };

  console.warn(`\n1. Catastro público (${query.kind})`);
  console.warn(`   URL: ${buildUrl(query)}`);
  const c = await catastro.query(query);
  if (!c.ok) {
    console.warn(`   ✗ ${c.error.code}: ${c.error.message}`);
    await dumpRaw(buildUrl(query));
    if (query.kind === "address") {
      console.warn(`   numerero: ${buildNumereroUrl(query)}`);
      await dumpRaw(buildNumereroUrl(query));
    }
    if (query.kind === "point") await tryCoordinateVariants(query.point);
  } else {
    const d = c.value.data;
    console.warn(
      `   ✓ ${d.cadastralRef} · ${d.address} · ${d.builtAreaM2 ?? "?"} m² · ${d.useLabel ?? "?"} · ${d.yearBuilt ?? "año n/d"} · coords ${
        d.coordinates ? `${d.coordinates.lat.toFixed(6)},${d.coordinates.lng.toFixed(6)}` : "n/d"
      }`,
    );
    for (const e of c.value.evidence) console.warn(`     evidencia ${e.verificationStatus}: ${e.sourceUrl}`);
  }

  console.warn(`\n2. Urbanismo público (${urbanism.layers().length} capas configuradas)`);
  const u = await urbanism.query({
    point: point
      ? { lat: Number(point[1]), lng: Number(point[2]) }
      : c.ok
        ? c.value.data.coordinates
        : undefined,
    cadastralRef: c.ok ? c.value.data.cadastralRef : rc ? text.toUpperCase() : undefined,
    address: text,
  });
  if (!u.ok) {
    console.warn(`   ✗ ${u.error.code}: ${u.error.message}`);
    if (u.error.details) console.warn(`     ${JSON.stringify(u.error.details)}`);
  } else {
    const p = u.value.data;
    console.warn(
      `   ✓ estado ${p.status} · ${p.zoningCode || "sin código"} · ${p.zoningLabel} · plantas ${p.maxFloors ?? "n/d"} · planta baja residencial ${p.groundFloorResidential}`,
    );
    console.warn(
      `     protección ${p.protectionLevel} · catalogado ${p.catalogued} · conjunto histórico ${p.inHistoricCentre}${p.heritageSector ? ` (${p.heritageSector})` : ""}`,
    );
    if (p.allowedUses.length) console.warn(`     usos: ${p.allowedUses.join("; ")}`);
    if (p.conditionedUses.length) console.warn(`     condicionados: ${p.conditionedUses.join("; ")}`);
    for (const n of p.notes) console.warn(`     nota: ${n}`);
    console.warn("     evidencias:");
    for (const e of u.value.evidence) {
      console.warn(`       - ${e.sourceName}`);
      console.warn(`         ${e.excerpt}`);
      console.warn(`         ${e.sourceUrl}`);
    }
  }
  process.exit(0);
}

/** The OVC coordinate service is picky about parameter spelling; try the known variants and report which answers. */
async function tryCoordinateVariants(p: { lat: number; lng: number }) {
  const base =
    "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_RCCOOR";
  const variants: Array<[string, string]> = [
    ["SRS sin codificar", `${base}?SRS=EPSG:4326&Coordenada_X=${p.lng}&Coordenada_Y=${p.lat}`],
    [
      "coma decimal",
      `${base}?SRS=EPSG:4326&Coordenada_X=${String(p.lng).replace(".", ",")}&Coordenada_Y=${String(p.lat).replace(".", ",")}`,
    ],
    ["EPSG:4258", `${base}?SRS=EPSG:4258&Coordenada_X=${p.lng}&Coordenada_Y=${p.lat}`],
    ["orden Y,X", `${base}?SRS=EPSG:4326&Coordenada_Y=${p.lat}&Coordenada_X=${p.lng}`],
    [
      "servicio XML (asmx)",
      `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${p.lng}&Coordenada_Y=${p.lat}`,
    ],
  ];
  console.warn("   variantes del servicio de coordenadas:");
  for (const [label, url] of variants) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const body = await res.text();
      console.warn(`     - ${label}: ${res.status} ${body.slice(0, 220)}`);
    } catch (e) {
      console.warn(`     - ${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function dumpRaw(url: string | null) {
  if (!url) return;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const body = await res.text();
    console.warn(`   respuesta cruda (${res.status}, ${body.length} bytes): ${body.slice(0, 1200)}`);
  } catch (e) {
    console.warn(`   no se pudo leer la respuesta cruda: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
