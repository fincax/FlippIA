import { timingSafeEqual } from "node:crypto";
import { lt } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { handle, jsonError, jsonOk } from "@/lib/api";
import { logger } from "@/modules/core/logger";
import { purgeRateLimits } from "@/server/auth/rate-limit";
import { evaluateAllWatches } from "@/server/services/watch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Scheduled Smart Watcher. Call it from any scheduler (Vercel Cron, GitHub
 * Actions, crontab) with `Authorization: Bearer $CRON_SECRET`. Also purges
 * expired sessions and stale rate-limit counters.
 */
export const POST = handle(async (req: Request) => {
  if (!authorized(req)) return jsonError("UNAUTHORIZED", "Cron no autorizado.", 401);
  const d = db();
  const started = Date.now();
  const result = await evaluateAllWatches(d);
  await d.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await purgeRateLimits(d);
  logger.info("cron.watches", { ...result, durationMs: Date.now() - started });
  return jsonOk({ ...result, durationMs: Date.now() - started });
});

export const GET = POST;
