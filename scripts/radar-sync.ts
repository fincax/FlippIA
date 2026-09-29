import "dotenv/config";
import { createDb } from "@/db/client";
import { adapters } from "@/modules/adapters";
import { syncListingSources } from "@/server/services/listing-sync";

/**
 * Pulls the configured Radar sources (RADAR_SOURCES: idealista, feeds) into the
 * database, the same job the scheduled endpoint /api/cron/radar runs:
 *
 *   pnpm radar:sync
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const sources = adapters().sources;
  console.warn(
    `RADAR_SOURCES=${process.env.RADAR_SOURCES ?? "demo"} → ${sources.map((s) => s.sourceName).join(" + ")}`,
  );
  const report = await syncListingSources(createDb(url), sources);
  for (const s of report.sources) {
    console.warn(
      `${s.errors.length ? "✗" : "✓"} ${s.sourceName}: ${s.fetched} recibidos · ${s.inserted} nuevos · ${s.updated} actualizados · ${s.priceChanges} cambios de precio · ${s.withdrawn} retirados${s.complete ? "" : " · pull incompleto"}`,
    );
    for (const e of s.errors) console.warn(`   · ${e}`);
  }
  if (!report.sources.length) console.warn("Ninguna fuente real configurada (solo DEMO).");
  if (report.sources.some((s) => s.errors.length)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
