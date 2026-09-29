import { db } from "@/db/client";
import { handle, jsonError, jsonOk } from "@/lib/api";
import { logger } from "@/modules/core/logger";
import { cronAuthorized } from "@/server/auth/cron";
import { syncListingSources } from "@/server/services/listing-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled Radar synchronisation: pulls every configured listing source
 * (Idealista API, partner feeds) into `opportunity_listings`, tracking price
 * changes and withdrawals. `Authorization: Bearer $CRON_SECRET`.
 */
export const POST = handle(async (req: Request) => {
  if (!cronAuthorized(req)) return jsonError("UNAUTHORIZED", "Cron no autorizado.", 401);
  const started = Date.now();
  const report = await syncListingSources(db());
  logger.info("cron.radar", { sources: report.sources.length, durationMs: Date.now() - started });
  return jsonOk({ ...report, durationMs: Date.now() - started });
});

export const GET = POST;
