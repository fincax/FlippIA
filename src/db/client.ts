import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export function createDb(url: string) {
  const client = postgres(url, { max: 10, prepare: false, onnotice: () => {} });
  return drizzle(client, { schema });
}

let instance: Database | undefined;

export function db(): Database {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    instance = createDb(url);
  }
  return instance;
}

export function setDb(d: Database | undefined) {
  instance = d;
}

export { schema };
