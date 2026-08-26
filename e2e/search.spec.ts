import "dotenv/config";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

/**
 * Universal search, end to end.
 *
 * The ranking is already pinned down by pure tests and the SQL by integration
 * tests. What only a browser can prove is the part that is neither: that one
 * typed word really does come back from three separate tables at once, grouped
 * so a reader can tell them apart, walkable from the keyboard, and that
 * following a result lands on that domain's own page.
 *
 * These specs WRITE to the database they point at. Everything they create is
 * prefixed and removed afterwards, but point DATABASE_URL at a development
 * database, not one you care about.
 */

const RUN = `sx${Date.now().toString(36)}`;
const named = (suffix: string) => `${RUN} ${suffix}`;

/** Distinctive enough that nothing seeded or previously captured can match it. */
const SHARED = `${RUN}shared`;

test.beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  // Seeded with SQL rather than through the UI: this suite is about retrieval,
  // and driving three separate creation flows first would make a search failure
  // look like a kitchen failure.
  const sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 1 });
  try {
    await sql`
      insert into projects (name, description, status)
      values (${named("Meal Prep")}, ${`Batch cooking ${SHARED} on Sundays`}, 'active')
    `;
    await sql`
      insert into kitchen_inventory (name, location, quantity, unit)
      values (${`${SHARED} breast`}, 'freezer', 2, 'lb')
    `;
    await sql`
      insert into items (title, kind, status)
      values (${named(`make ${SHARED} before the game`)}, 'task', 'active')
    `;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
});

test.afterAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 1 });
  try {
    await sql`delete from items where title like ${`${RUN}%`}`;
    await sql`delete from kitchen_inventory where name like ${`${RUN}%`}`;
    await sql`delete from projects where name like ${`${RUN}%`}`;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
});

test("one word comes back from every domain, grouped by where it came from", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByRole("heading", { level: 1, name: "Search" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("searchbox", { name: "Search" }).fill(SHARED);
  await page.getByRole("searchbox", { name: "Search" }).press("Enter");

  // The query is in the URL, which is what makes a result set a link.
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${SHARED}`));

  // Three domains, three headings. The kitchen leads: the food's name starts
  // with the query, while the others only mention it.
  await expect(page.getByRole("heading", { name: /^Kitchen/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Items/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Projects/ })).toBeVisible();

  await expect(page.getByRole("link", { name: new RegExp(`${SHARED} breast`) })).toBeVisible();
  await expect(page.getByRole("link", { name: /make .* before the game/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Meal Prep/ })).toBeVisible();
});

test("a result is reached and opened from the keyboard alone", async ({ page }) => {
  await page.goto(`/search?q=${SHARED}`);

  const box = page.getByRole("searchbox", { name: "Search" });
  await expect(box).toBeVisible({ timeout: 30_000 });

  const results = page.locator("a[data-search-hit]");
  await expect(results.first()).toBeVisible();

  // Down out of the query box lands on the first result. Pressing on a poll
  // rides out hydration: a key sent to a page React has not claimed yet is
  // simply lost, which would make this flaky rather than wrong.
  await expect
    .poll(
      async () => {
        await box.focus();
        await box.press("ArrowDown");
        return page.evaluate(() => document.activeElement?.getAttribute("data-search-hit") ?? null);
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();

  const first = await page.evaluate(() => document.activeElement?.getAttribute("data-search-hit"));

  // Down moves on, Up comes back - so the list is walkable in both directions.
  await page.keyboard.press("ArrowDown");
  const second = await page.evaluate(() => document.activeElement?.getAttribute("data-search-hit"));
  expect(second).not.toBe(first);

  await page.keyboard.press("ArrowUp");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-search-hit"))).toBe(
    first,
  );

  // Escape gives the query box back, so a wrong search is retyped without reaching
  // for the mouse.
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("search-query");

  // And Enter opens the focused result, because it is an ordinary link and
  // nothing intercepted it.
  await box.press("ArrowDown");
  await page.keyboard.press("Enter");

  // The kitchen result leads, so this lands on the kitchen's own record.
  await expect(page).toHaveURL(/\/kitchen\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("each domain's result opens that domain's own page", async ({ page }) => {
  for (const [pattern, destination] of [
    [new RegExp(`${SHARED} breast`), /\/kitchen\/[0-9a-f-]{36}$/],
    [/make .* before the game/, /\/items\/[0-9a-f-]{36}$/],
    [/Meal Prep/, /\/projects\/[0-9a-f-]{36}$/],
  ] as const) {
    await page.goto(`/search?q=${SHARED}`);
    await page.getByRole("link", { name: pattern }).first().click();
    await expect(page).toHaveURL(destination);
  }
});

test("Back returns to the results, because the query is the URL", async ({ page }) => {
  await page.goto(`/search?q=${SHARED}`);
  await page.getByRole("link", { name: new RegExp(`${SHARED} breast`) }).click();
  await expect(page).toHaveURL(/\/kitchen\/[0-9a-f-]{36}$/);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${SHARED}`));
  await expect(page.getByRole("heading", { name: /^Kitchen/ })).toBeVisible();
});

test("the results are usable on a phone, with nothing spilling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/search?q=${SHARED}`);
  await expect(page.getByRole("heading", { name: /^Kitchen/ })).toBeVisible({ timeout: 30_000 });

  // Objective, not a judgement about a screenshot: nothing may make the page
  // scroll sideways at the narrowest width TylerOS supports.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

  // A long name has to wrap rather than widen the row it sits in.
  for (const box of await page.locator("a[data-search-hit]").all()) {
    const width = (await box.boundingBox())?.width ?? 0;
    expect(width).toBeLessThanOrEqual(375);
  }

  // Every result is a comfortable tap target. 44px is the usual floor.
  const first = await page.locator("a[data-search-hit]").first().boundingBox();
  expect(first?.height ?? 0).toBeGreaterThanOrEqual(44);
});
