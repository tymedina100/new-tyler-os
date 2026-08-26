import "dotenv/config";
import { chromium } from "@playwright/test";
import postgres from "postgres";
import { AUTH_STORAGE_STATE_PATH, E2E_AUTH_PASSPHRASE } from "./auth-fixtures";

/**
 * Refuses to start the smoke suite unless the database is actually ready, and
 * signs in once so every other spec inherits a working session.
 *
 * Without the database check, a missing DATABASE_URL surfaces as a browser
 * timing out on a 500 page, which reads like a broken application rather than
 * a missing prerequisite. Without the sign-in, every existing spec would need
 * its own login step just to reach the screen it actually tests — this file
 * does it once, by driving the real form, and saves the resulting cookie to
 * `AUTH_STORAGE_STATE_PATH` for `playwright.config.ts` to hand to every test.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "The smoke suite needs a database.\n\n" +
        "  DATABASE_URL is not set. Copy .env.example to .env and point it at any\n" +
        "  PostgreSQL — local (docker compose up -d) or remote.\n\n" +
        "  Then: pnpm db:migrate && pnpm db:seed && pnpm check:env\n\n" +
        "  The database-independent suite still runs: pnpm test",
    );
  }

  const sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 1 });

  try {
    const [row] = await sql<{ items: number }[]>`select count(*)::int as items from items`;

    if ((row?.items ?? 0) === 0) {
      throw new Error(
        "The database is reachable but empty.\n\n" +
          "  The smoke suite reads seeded content. Run: pnpm db:seed",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The database is reachable"))
      throw error;

    throw new Error(
      `Could not query the database: ${error instanceof Error ? error.message : String(error)}\n\n` +
        "  Diagnose it with: pnpm check:env",
    );
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }

  await signInOnce();
}

/**
 * Drives the real `/login` form, exactly as a person would, and saves the
 * cookie it produces. Not a shortcut through `signInAction` directly — this
 * is also the first proof, before any spec runs, that the passphrase set on
 * the dev server (`playwright.config.ts`) actually matches the one used here.
 */
async function signInOnce(): Promise<void> {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.goto("http://localhost:3000/login");
    await page.getByLabel("Passphrase").fill(E2E_AUTH_PASSPHRASE);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("http://localhost:3000/");
    await page.context().storageState({ path: AUTH_STORAGE_STATE_PATH });
  } finally {
    await browser.close();
  }
}
