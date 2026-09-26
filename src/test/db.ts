import { createDb, type Database } from "@/db/client";
import type { TenantContext } from "@/server/context";

let testDb: Database | undefined;

export function getTestDb(): Database {
  testDb ??= createDb(
    process.env.DATABASE_URL_TEST ?? "postgres://flippia:flippia@localhost:5432/flippia_test",
  );
  return testDb;
}

export function ctxFor(
  organizationId: string,
  userId: string,
  role: TenantContext["role"] = "owner",
): TenantContext {
  return { organizationId, userId, role, db: getTestDb() };
}
