import path from "node:path";

/**
 * The one passphrase and secret the browser suite runs behind.
 *
 * Shared by three files that must agree on the exact same values:
 * `playwright.config.ts` (sets them on the dev server it spawns),
 * `global-setup.ts` (signs in once through the real form and saves the
 * resulting cookie), and `auth.spec.ts` (proves the wrong passphrase is
 * rejected). One module, so there is nowhere for the three to drift apart.
 *
 * Test-only values, never used outside a Playwright run, and never the
 * repository's own `.env` — see docs/DECISIONS.md ADR 030.
 */
export const E2E_AUTH_PASSPHRASE = "the-e2e-suite-signs-in-with-this-phrase";
export const E2E_SESSION_SECRET = "e2e-suite-session-secret-0123456789abcdef";

/**
 * Where the signed-in cookie lands after `global-setup.ts` logs in once.
 * Under `test-results/`, which is already git-ignored, rather than a new
 * ignore rule for a single throwaway file.
 */
export const AUTH_STORAGE_STATE_PATH = path.join("test-results", ".auth", "storage-state.json");
