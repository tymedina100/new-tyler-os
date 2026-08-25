import "dotenv/config";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

/**
 * The five things that, if broken, make TylerOS unusable.
 *
 * Not a second copy of the domain suite — those rules are already covered by
 * fast unit tests. This proves the wiring: browser to server action to Postgres
 * and back.
 *
 * These specs WRITE to the database they point at. Everything they create is
 * prefixed and removed afterwards, but point DATABASE_URL at a development
 * database, not one you care about.
 */

const RUN = `smoke-${Date.now().toString(36)}`;
const capture = (suffix: string) => `${RUN} ${suffix}`;

test.afterAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 1 });
  try {
    await sql`delete from items where title like ${`${RUN}%`}`;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
});

test("the application loads and the shell is present", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await expect(page.getByLabel("Capture")).toBeVisible();

  for (const destination of ["Today", "Inbox", "Tasks", "Projects", "Search"]) {
    await expect(page.getByRole("link", { name: destination }).first()).toBeVisible();
  }
});

test("capturing creates an item that appears in the inbox", async ({ page }) => {
  const title = capture("buy lightbulbs");

  await page.goto("/");
  await page.getByLabel("Capture").fill(title);
  await page.getByLabel("Capture").press("Enter");

  // Capture lands in the inbox, so Today surfaces it as needing triage.
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("inline tags are parsed out of captured text", async ({ page }) => {
  const title = capture("water the plants");

  await page.goto("/inbox");
  await page.getByLabel("Capture").fill(`${title} #household`);
  await page.getByLabel("Capture").press("Enter");

  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row.getByRole("link", { name: title })).toBeVisible();
  await expect(row.getByRole("link", { name: "household" })).toBeVisible();
});

test("completing an item takes it out of the inbox", async ({ page }) => {
  const title = capture("cancel the trial");

  await page.goto("/inbox");
  await page.getByLabel("Capture").fill(title);
  await page.getByLabel("Capture").press("Enter");
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await page.getByRole("button", { name: `Complete ${title}` }).click();

  // Optimistic, then persisted: a completed item is no longer untriaged.
  await expect(page.getByRole("button", { name: `Reopen ${title}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("search finds captured content", async ({ page }) => {
  const distinctive = `zibberwock${Date.now().toString(36)}`;
  const title = capture(distinctive);

  await page.goto("/");
  await page.getByLabel("Capture").fill(title);
  await page.getByLabel("Capture").press("Enter");
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await page.goto("/search");
  await page.getByRole("searchbox", { name: "Search" }).fill(distinctive);
  await page.getByRole("searchbox", { name: "Search" }).press("Enter");

  await expect(page.getByRole("link", { name: title })).toBeVisible();
});
