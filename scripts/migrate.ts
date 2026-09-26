import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.argv[2] ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const d = drizzle(client);
  await client`CREATE EXTENSION IF NOT EXISTS postgis`;
  await client`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  try {
    await client`CREATE EXTENSION IF NOT EXISTS vector`;
  } catch {
    console.warn("pgvector not available: semantic retrieval will use lexical search.");
  }
  await migrate(d, { migrationsFolder: "./drizzle" });
  await client.end();
  console.warn(`Migrations applied to ${url.replace(/:\/\/.*@/, "://***@")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
