import { defineConfig, devices } from "@playwright/test";
import {
  AUTH_STORAGE_STATE_PATH,
  E2E_AUTH_PASSPHRASE,
  E2E_SESSION_SECRET,
} from "./e2e/auth-fixtures";

/**
 * Smoke tests against a real database and a real browser.
 *
 * Deliberately separate from `pnpm test` and outside `pnpm check`: these need a
 * reachable DATABASE_URL, and the default suite must stay runnable with no
 * database and no network. Run `pnpm check:env` first if unsure.
 *
 * Chromium only. This suite exists to prove TylerOS is wired together end to
 * end, not to test browser compatibility for a single-user personal app.
 *
 * The dev server this spins up is guarded, the same as any other TylerOS
 * deployment — see docs/DECISIONS.md ADR 030. `global-setup.ts` signs in once
 * through the real form and every spec inherits that session via
 * `storageState`, so the five existing suites needed no change to keep
 * running signed in. `auth.spec.ts` is the one file that deliberately opts out
 * of that inherited session to exercise the unauthenticated paths.
 */
export default defineConfig({
  testDir: "./e2e",
  // Dedicated destructive fixture reset is isolated by its own guarded config.
  testIgnore: ["operations.spec.ts", "knowledge.spec.ts", "food.spec.ts"],
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false, // one database, and the specs write to it
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],

  // localhost, not 127.0.0.1. Next blocks cross-origin requests to dev-only
  // assets, and the dev server is initialised with `localhost` as its origin, so
  // driving it through 127.0.0.1 silently blocks every client chunk: pages still
  // render, but nothing hydrates and only progressively-enhanced forms work.
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: AUTH_STORAGE_STATE_PATH,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      AUTH_PASSPHRASE: E2E_AUTH_PASSPHRASE,
      SESSION_SECRET: E2E_SESSION_SECRET,
    },
  },
});
