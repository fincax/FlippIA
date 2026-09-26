import { execSync } from "node:child_process";
import { beforeAll } from "vitest";

/**
 * Integration tests run against DATABASE_URL_TEST (default flippia_test).
 * The schema is reset and migrated once per run.
 */
beforeAll(() => {
  const url = process.env.DATABASE_URL_TEST ?? "postgres://flippia:flippia@localhost:5432/flippia_test";
  process.env.DATABASE_URL = url;
  execSync(`pnpm tsx scripts/reset.ts ${url}`, { stdio: "ignore" });
  execSync(`pnpm tsx scripts/migrate.ts ${url}`, { stdio: "ignore" });
}, 120_000);
