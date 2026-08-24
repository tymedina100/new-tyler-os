import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests run in a plain Node environment.
 *
 * Domain tests are pure and need nothing. Integration tests boot an in-process
 * Postgres (PGlite), so they need no Docker and no running server either.
 * There is deliberately no jsdom/browser setup: UI behaviour worth asserting on
 * belongs in Playwright once the UI stabilises, not in brittle unit tests.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
