import "dotenv/config";
import { defineConfig } from "drizzle-kit";

function requireUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url;
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: requireUrl(),
  },
  strict: true,
  verbose: true,
});
