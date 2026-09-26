/** Runs once when the Next.js server boots. Validates the environment before serving traffic. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionEnv } = await import("@/server/env");
    assertProductionEnv();
  }
}
