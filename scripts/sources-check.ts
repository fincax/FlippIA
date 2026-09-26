import "dotenv/config";
import { CatastroPublicAdapter } from "@/modules/adapters/catastro/public";
import { UrbanismoPublicConnector } from "@/modules/adapters/urbanismo-sevilla/public";
import { parseIntake } from "@/modules/property/intake";

/**
 * End-to-end check of the free public sources for one property, independent of
 * the environment's *_MODE settings:
 *
 *   pnpm sources:check "Calle Pureza 45, Sevilla"
 *   pnpm sources:check 4219020TG3441N
 *   pnpm sources:check 37.3826,-5.9963
 */
async function main() {
  const text = process.argv.slice(2).join(" ").trim();
  if (!text) throw new Error('Uso: pnpm sources:check "<dirección | referencia catastral | lat,lng>"');
  const catastro = new CatastroPublicAdapter();
  const urbanism = new UrbanismoPublicConnector();
  const point = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  const rc = text.match(/^[0-9A-Z]{14}([0-9A-Z]{6})?$/i);
  const intake = parseIntake(text);
  const query = point
    ? ({ kind: "point", point: { lat: Number(point[1]), lng: Number(point[2]) } } as const)
    : rc
      ? ({
          kind: "cadastralRef",
          cadastralRef: text.toUpperCase(),
          municipality: "SEVILLA",
          province: "SEVILLA",
        } as const)
      : ({
          kind: "address",
          municipality: "SEVILLA",
          province: "SEVILLA",
          street:
            (intake.property?.address ?? text)
              .replace(/\d.*$/, "")
              .replace(/^(calle|c\/|avenida|avda\.?|plaza)\s+/i, "")
              .trim() || text,
          number: text.match(/\d{1,4}/)?.[0] ?? "1",
        } as const);

  console.warn(`\n1. Catastro público (${query.kind})`);
  const c = await catastro.query(query);
  if (!c.ok) {
    console.warn(`   ✗ ${c.error.code}: ${c.error.message}`);
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
      `   ✓ estado ${p.status} · ${p.zoningCode || "sin calificación"} ${p.zoningLabel} · plantas ${p.maxFloors ?? "n/d"}`,
    );
    console.warn(
      `     protección ${p.protectionLevel} · conjunto histórico ${p.inHistoricCentre} ${p.heritageSector ?? ""}`,
    );
    if (p.conditionedUses.length) console.warn(`     condicionados: ${p.conditionedUses.join("; ")}`);
    for (const n of p.notes) console.warn(`     nota: ${n}`);
    for (const e of u.value.evidence) console.warn(`     evidencia: ${e.sourceName} → ${e.excerpt}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
