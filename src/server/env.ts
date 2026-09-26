import { logger } from "@/modules/core/logger";

const isProduction = () => process.env.NODE_ENV === "production";
const MIN_SECRET_LENGTH = 32;
const DEV_SECRET = "dev-secret-not-for-production";
const DEFAULT_DEMO_PASSWORD = "flippia-demo";

let warnedDevSecret = false;

/**
 * Secret used to sign CSRF tokens and any future signed payload.
 * Production refuses to run without a real secret; development falls back
 * to a fixed value and logs a warning once.
 */
export function appSecret(): string {
  const secret = process.env.APP_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;
  if (isProduction()) {
    throw new Error(`APP_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long in production`);
  }
  if (!warnedDevSecret) {
    warnedDevSecret = true;
    logger.warn("env.app_secret.dev_fallback", { minLength: MIN_SECRET_LENGTH });
  }
  return secret && secret.length > 0 ? secret : DEV_SECRET;
}

/** Problems that make a production deployment unsafe. Empty when the environment is sound. */
export function productionEnvProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is not set");
  if (!env.APP_SECRET || env.APP_SECRET.length < MIN_SECRET_LENGTH)
    problems.push(`APP_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  if (env.DEMO_MODE === "true" && (env.DEMO_USER_PASSWORD ?? DEFAULT_DEMO_PASSWORD) === DEFAULT_DEMO_PASSWORD)
    problems.push(
      "DEMO_MODE=true with the default DEMO_USER_PASSWORD; set a private password or disable the demo",
    );
  const modes: Array<[string, string | undefined, string[]]> = [
    ["CATASTRO_MODE", env.CATASTRO_MODE, ["demo", "public"]],
    ["URBANISMO_SEVILLA_MODE", env.URBANISMO_SEVILLA_MODE, ["demo", "public", "official"]],
    ["MARKET_SOURCE_MODE", env.MARKET_SOURCE_MODE, ["demo"]],
    ["FINANCING_PROVIDER_MODE", env.FINANCING_PROVIDER_MODE, ["demo"]],
  ];
  for (const [name, value, allowed] of modes) {
    if (value && !allowed.includes(value))
      problems.push(`${name}=${value} is not supported (${allowed.join(" | ")})`);
  }
  if (env.URBANISMO_SEVILLA_MODE === "official" && !env.URBANISMO_SEVILLA_ENDPOINT)
    problems.push("URBANISMO_SEVILLA_MODE=official requires URBANISMO_SEVILLA_ENDPOINT");
  return problems;
}

let asserted = false;

/**
 * Fail fast on an unsafe production configuration. Called once from the
 * server instrumentation hook; a no-op outside production.
 */
export function assertProductionEnv(): void {
  if (asserted || !isProduction()) return;
  asserted = true;
  const problems = productionEnvProblems();
  if (problems.length) throw new Error(`Unsafe production configuration:\n- ${problems.join("\n- ")}`);
  if (process.env.AI_PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY)
    logger.warn("env.ai_key_missing", { note: "LIA runs in deterministic mode" });
}
