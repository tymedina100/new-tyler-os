import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against a real database and a real browser.
 *
 * Deliberately separate from `pnpm test` and outside `pnpm check`: these need a
 * reachable DATABASE_URL, and the default suite must stay runnable with no
 * database and no network. Run `pnpm check:env` first if unsure.
 *
 * Chromium only. This suite exists to prove TylerOS is wired together end to
 * end, not to test browser compatibility for a single-user personal app.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false, // one database, and the specs write to it
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
