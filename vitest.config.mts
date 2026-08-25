import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests run in a plain Node environment.
 *
 * Domain tests are pure and need nothing. Integration tests boot an in-process
 * Postgres (PGlite), so they need no Docker and no running server either. This
 * whole suite must stay runnable with no database and no network.
 *
 * There is deliberately no jsdom/browser setup. Browser behaviour is covered by
 * the Playwright smoke suite in `e2e/`, which needs a real database and is run
 * separately with `pnpm test:e2e`. The `include` patterns below match only
 * `*.test.ts`, so `e2e/*.spec.ts` can never be picked up here by accident.
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
