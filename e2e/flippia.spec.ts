import { expect, test } from "@playwright/test";

/**
 * End-to-end vertical slice. Requires a running server against a seeded
 * database (`pnpm db:migrate && pnpm db:seed && pnpm build && pnpm start`).
 */
const email = `e2e-${Date.now()}@example.com`;
const password = "e2e-password-123";

test("onboarding → analyze → scenarios → stress → passport → watch", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Nombre").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL("**/app/onboarding");
  await page.getByRole("button", { name: "Guardar Investor DNA" }).click();
  await expect(page.getByText("Investor DNA guardado.")).toBeVisible();

  await page.goto("/app");
  await page.getByLabel("Qué quieres descubrir").fill("Analiza Calle Pureza 45, Triana, 95 m2, 3 habitaciones, para reformar por 255.000 €");
  await page.getByRole("button", { name: "Descubrir" }).click();
  await page.waitForURL("**/app/analyze?**");
  await expect(page.getByText("LIA está construyendo el caso")).toBeVisible();
  await page.waitForURL("**/app/deals/deal_*", { timeout: 60_000 });
  await expect(page.getByText(/posibles futuros para este activo/)).toBeVisible();
  const dealUrl = new URL(page.url()).pathname;

  await page.goto(`${dealUrl}/scenarios`);
  await expect(page.getByRole("tab", { name: "Base" })).toBeVisible();
  await page.getByPlaceholder("p. ej. 55000").fill("60000");
  await page.getByRole("button", { name: "Simular" }).click();
  await expect(page.getByText("Resultado temporal")).toBeVisible();

  await page.goto(`${dealUrl}/risk`);
  await expect(page.getByText("Rompe esta inversión")).toBeVisible();
  await expect(page.getByText("Stress test").first()).toBeVisible();

  await page.goto(`${dealUrl}/finance`);
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByText("Precio máximo")).toBeVisible();

  await page.goto(`${dealUrl}/passport`);
  await expect(page.getByText("Deal Passport · documento vivo")).toBeVisible();

  await page.goto(dealUrl);
  await page.getByRole("button", { name: "Watch this deal" }).click();
  await expect(page.getByRole("button", { name: "Vigilando ✓" })).toBeVisible();

  await page.goto(`${dealUrl}/lia`);
  await page.getByRole("button", { name: "¿Hasta cuánto puedo pagar?" }).click();
  await expect(page.getByText(/precio máximo/i).first()).toBeVisible();
});

test("tenant isolation: another account cannot open the deal", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /demo/i }).click();
  await page.waitForURL("**/app");
  await page.goto("/app/deals");
  const href = await page.locator('a[href^="/app/deals/deal_"]').first().getAttribute("href");
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto("/register");
  await p2.getByLabel("Nombre").fill("Other Org");
  await p2.getByLabel("Email").fill(`other-${Date.now()}@example.com`);
  await p2.getByLabel("Contraseña").fill(password);
  await p2.getByRole("button", { name: "Crear cuenta" }).click();
  await p2.waitForURL("**/app/onboarding");
  const res = await p2.goto(href!);
  expect(res?.status()).toBe(404);
  await other.close();
});

test("mobile: home command bar and deal room render", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByLabel("Qué quieres descubrir")).toBeVisible();
  await page.goto("/login");
  await page.getByRole("button", { name: /demo/i }).click();
  await page.waitForURL("**/app");
  await expect(page.getByRole("navigation").last()).toBeVisible();
  await ctx.close();
});
