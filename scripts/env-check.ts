import "dotenv/config";
import { productionEnvProblems } from "@/server/env";

/**
 * Validates the environment the way the server does at start-up, so a bad
 * .env is caught before the container is (re)started:
 *
 *   pnpm env:check
 */
const problems = productionEnvProblems({ ...process.env, NODE_ENV: "production" });
if (problems.length) {
  console.error("Configuración no válida para producción:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.warn("Configuración válida para producción.");
}
