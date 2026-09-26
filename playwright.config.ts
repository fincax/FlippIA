import { defineConfig } from "@playwright/test";

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    // On Linux CI images a system Chromium is used; elsewhere `pnpm exec playwright install chromium`.
    launchOptions: chromiumPath ? { executablePath: chromiumPath, args: ["--no-sandbox"] } : {},
  },
  reporter: [["list"]],
});
