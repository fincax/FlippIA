import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createDb } from "@/db/client";
import { memberships, organizations } from "@/db/schema";
import { parseListingsCsv } from "@/modules/adapters/sources/csv";
import { addListings, ListingImportError } from "@/server/services/listings";

/**
 * Imports an organisation's own listings (partner export, network sheet,
 * manual list) into its Radar:
 *
 *   pnpm listings:import listados.csv --org mi-organizacion
 *
 * Columns (header row, `;` or `,` separated): title, address, price,
 * area_m2, asset_use, typology, condition, bedrooms, bathrooms, floor,
 * elevator, microzone_id, lat, lng, published_at, reference.
 * See docs/DATA_SOURCES.md.
 */
async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const orgFlag = args.indexOf("--org");
  const slug = orgFlag >= 0 ? args[orgFlag + 1] : undefined;
  if (!file || !slug) throw new Error("Uso: pnpm listings:import <fichero.csv> --org <slug>");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const parsed = parseListingsCsv(readFileSync(file, "utf8"));
  if (parsed.errors.length) {
    for (const e of parsed.errors) console.error(`✗ ${e}`);
    process.exitCode = 1;
    return;
  }
  const db = createDb(url);
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!org) throw new Error(`Organización "${slug}" no encontrada`);
  const [member] = await db.select().from(memberships).where(eq(memberships.organizationId, org.id)).limit(1);
  try {
    const rows = await addListings(
      { organizationId: org.id, userId: member?.userId ?? "system", role: "owner", db },
      parsed.listings,
    );
    console.warn(`✓ ${rows.length} listados importados en ${org.name}.`);
  } catch (e) {
    if (e instanceof ListingImportError) {
      for (const issue of e.issues) console.error(`✗ ${issue}`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
