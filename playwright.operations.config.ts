import { defineConfig, devices } from "@playwright/test";
import { E2E_AUTH_PASSPHRASE, E2E_SESSION_SECRET } from "./e2e/auth-fixtures";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "operations.spec.ts",
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3004",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --port 3004",
    url: "http://localhost:3004",
    timeout: 180000,
    env: {
      ...process.env,
      AUTH_PASSPHRASE: E2E_AUTH_PASSPHRASE,
      SESSION_SECRET: E2E_SESSION_SECRET,
      TYLEROS_MOBILE_E2E: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
