import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

const isProduction = process.env.NODE_ENV === "production";

/**
 * Pool defaults: PgBouncer-safe (`prepare: false`), bounded idle/connect
 * timeouts and TLS in production. `DATABASE_SSL=false` opts out for private
 * networks; `?sslmode=` in the URL still wins when present.
 */
export function createDb(url: string) {
  const sslInUrl = /[?&]ssl(mode)?=/.test(url);
  const sslEnv = process.env.DATABASE_SSL;
  const ssl = sslInUrl
    ? undefined
    : sslEnv === "false"
      ? false
      : sslEnv === "true" || isProduction
        ? "require"
        : false;
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    ...(ssl === undefined ? {} : { ssl }),
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}

/** Cached on globalThis so `next dev` hot reloads reuse one pool instead of leaking connections. */
const globalRef = globalThis as typeof globalThis & { __flippiaDb?: Database };

export function db(): Database {
  if (!globalRef.__flippiaDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalRef.__flippiaDb = createDb(url);
  }
  return globalRef.__flippiaDb;
}

export function setDb(d: Database | undefined) {
  globalRef.__flippiaDb = d;
}

export { schema };
