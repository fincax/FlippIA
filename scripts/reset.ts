import "dotenv/config";
import postgres from "postgres";

/** Drops the public schema of the configured database. Development only. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db"]);

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
  const url = process.argv[2] ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host) && process.env.ALLOW_DB_RESET !== "true")
    throw new Error(`Refusing to reset a non-local database (${host}). Set ALLOW_DB_RESET=true to confirm.`);
  console.warn(`Resetting ${url.replace(/:\/\/.*@/, "://***@")}`);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await client`DROP SCHEMA IF EXISTS public CASCADE`;
  await client`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await client`CREATE SCHEMA public`;
  await client.end();
  console.warn("Database reset.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
