import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createDb } from "@/db/client";
import { memberships, organizations } from "@/db/schema";
import { parseComparablesCsv } from "@/modules/adapters/market/csv";
import { addComparables } from "@/server/services/comparables";

/**
 * Imports own comparables (transactions, valuations, witnesses) from a CSV
 * into one organisation:
 *
 *   pnpm comparables:import testigos.csv --org mi-organizacion
 *
 * Columns (header row, `;` or `,` separated): kind, type, price, area_m2,
 * date, lat, lng, condition, asset_use, floor, elevator, exterior, label,
 * reference, note. See docs/DATA_SOURCES.md.
 */
async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const orgFlag = args.indexOf("--org");
  const slug = orgFlag >= 0 ? args[orgFlag + 1] : undefined;
  if (!file || !slug) throw new Error("Uso: pnpm comparables:import <fichero.csv> --org <slug>");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const parsed = parseComparablesCsv(readFileSync(file, "utf8"));
  if (parsed.errors.length) {
    for (const e of parsed.errors) console.error(`✗ ${e}`);
    process.exitCode = 1;
    return;
  }
  const db = createDb(url);
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!org) throw new Error(`Organización "${slug}" no encontrada`);
  const [member] = await db.select().from(memberships).where(eq(memberships.organizationId, org.id)).limit(1);
  const rows = await addComparables(
    { organizationId: org.id, userId: member?.userId ?? "system", role: "owner", db },
    parsed.comparables,
  );
  console.warn(`✓ ${rows.length} comparables importados en ${org.name}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
