import { expect, test } from "@playwright/test";
import { E2E_AUTH_PASSPHRASE } from "./auth-fixtures";

/**
 * The access boundary, end to end.
 *
 * Every other spec in this suite inherits an authenticated session from
 * `global-setup.ts` — proving TylerOS works once signed in is their job. This
 * file is the one that deliberately starts with no session, because that is
 * the state anyone reaches this application in from outside it.
 */

test.describe("with no session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("every top-level destination redirects to sign-in", async ({ page }) => {
    for (const route of [
      "/",
      "/inbox",
      "/upcoming",
      "/tasks",
      "/projects",
      "/kitchen",
      "/search",
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("a visit to a protected route is where sign-in returns to", async ({ page }) => {
    await page.goto("/kitchen");
    await expect(page).toHaveURL(/\/login\?next=%2Fkitchen/);

    await page.getByLabel("Passphrase").fill(E2E_AUTH_PASSPHRASE);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("http://localhost:3000/kitchen");
  });

  test("the manifest and icon load without a cookie", async ({ request }) => {
    for (const path of ["/manifest.webmanifest", "/icon"]) {
      const response = await request.get(path);
      expect(response.ok(), `${path} should be reachable while signed out`).toBe(true);
    }
  });

  test("a wrong passphrase is rejected, visibly, and nothing is granted", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Passphrase").fill("definitely the wrong phrase");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "not correct" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the correct passphrase reaches Today", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Passphrase").fill(E2E_AUTH_PASSPHRASE);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("http://localhost:3000/");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  });
});

test.describe("with a session", () => {
  // No storageState override: inherits the one `global-setup.ts` produced.

  test("signing out ends the session everywhere, immediately", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/login/);

    await page.goto("/kitchen");
    await expect(page).toHaveURL(/\/login/);
  });
});
