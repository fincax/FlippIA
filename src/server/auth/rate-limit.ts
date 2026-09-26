import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { logger } from "@/modules/core/logger";

/**
 * Fixed-window rate limiter backed by the `rate_limits` table, so every
 * instance shares the same counters. Falls back to an in-memory window when
 * the database is unreachable (the request is then limited per process).
 */
const memory = new Map<string, { windowStart: number; count: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function rateLimit(
  db: Database | null,
  key: string,
  limit: number,
  windowMs: number,
  now = new Date(),
): Promise<RateLimitResult> {
  if (db) {
    try {
      const nowIso = now.toISOString();
      const cutoffIso = new Date(now.getTime() - windowMs).toISOString();
      const rows = await db.execute<{ count: number }>(sql`
        insert into rate_limits (key, window_start, count)
        values (${key}, ${nowIso}::timestamptz, 1)
        on conflict (key) do update set
          count = case
            when rate_limits.window_start < ${cutoffIso}::timestamptz then 1
            else rate_limits.count + 1
          end,
          window_start = case
            when rate_limits.window_start < ${cutoffIso}::timestamptz then ${nowIso}::timestamptz
            else rate_limits.window_start
          end
        returning count
      `);
      const count = Number(rows[0]?.count ?? 1);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
    } catch (e) {
      logger.warn("rate_limit.db_unavailable", { error: e instanceof Error ? e.message : String(e) });
    }
  }
  return rateLimitMemory(key, limit, windowMs, now.getTime());
}

export function rateLimitMemory(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const entry = memory.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    memory.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: limit - 1 };
  }
  entry.count += 1;
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
}

/** Housekeeping: drop counters whose window ended more than a day ago. */
export async function purgeRateLimits(db: Database, now = new Date()): Promise<void> {
  const cutoffIso = new Date(now.getTime() - 86_400_000).toISOString();
  await db.execute(sql`delete from rate_limits where window_start < ${cutoffIso}::timestamptz`);
}

export function resetRateLimits() {
  memory.clear();
}
