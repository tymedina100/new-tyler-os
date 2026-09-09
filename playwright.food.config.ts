import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { E2E_AUTH_PASSPHRASE, E2E_SESSION_SECRET } from "./e2e/auth-fixtures";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "food.spec.ts",
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3006",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --port 3006",
    url: "http://localhost:3006",
    timeout: 180000,
    env: {
      ...process.env,
      AUTH_PASSPHRASE: E2E_AUTH_PASSPHRASE,
      SESSION_SECRET: E2E_SESSION_SECRET,
      TYLEROS_KNOWLEDGE_PATH: path.resolve("../work/knowledge-e2e.json"),
      TYLEROS_WORK_BOARD_PATH: path.resolve("../work/board-e2e.json"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
