import { defineConfig, devices } from "@playwright/test";
import { E2E_AUTH_PASSPHRASE, E2E_SESSION_SECRET } from "./e2e/auth-fixtures";

// Intentionally fixed: this suite must never inherit a personal/prod DATABASE_URL.
const databaseUrl = "postgresql://tyleros_local@localhost:55432/tyleros_mobile_test";
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "mobile-consistency.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  outputDir: "test-results/mobile-consistency",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/mobile-consistency", open: "never" }],
  ],
  use: {
    baseURL: "http://localhost:3001",
    // Auth tokens and passphrases must not be persisted in a network trace.
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec next dev --port 3001",
    url: "http://localhost:3001/login",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      AUTH_PASSPHRASE: E2E_AUTH_PASSPHRASE,
      SESSION_SECRET: E2E_SESSION_SECRET,
      TYLEROS_MOBILE_E2E: "1",
      RUNTIME_TOKEN: "",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
  },
});
