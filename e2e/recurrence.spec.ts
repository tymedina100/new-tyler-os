import "dotenv/config";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";

/**
 * Recurrence, end to end.
 *
 * The date arithmetic has fast unit tests and the persistence has integration
 * tests; what only a browser proves is the thing a person would notice first —
 * that ticking off a repeating responsibility does not finish it. That is the
 * behaviour this milestone exists for, so it is the behaviour that gets a spec.
 *
 * These specs WRITE to the database they point at. Everything they create is
 * prefixed and removed afterwards, but point DATABASE_URL at a development
 * database, not one you care about.
 */

const RUN = `rc-${Date.now().toString(36)}`;
const named = (suffix: string) => `${RUN} ${suffix}`;

test.afterAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 1 });
  try {
    // item_recurrence cascades from items, which is itself worth not forgetting.
    await sql`delete from items where title like ${`${RUN}%`}`;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
});

/** Capture waits for the box to clear: that is the signal the write finished. */
async function capture(page: Page, text: string): Promise<void> {
  const box = page.getByLabel("Capture");
  await box.fill(text);
  await box.press("Enter");
  await expect(box).toHaveValue("");
}

/**
 * Row-menu actions revalidate the whole layout, and navigating before that
 * lands cancels the write. Every helper here waits for something the user would
 * also see before moving on - see the 0.2 note in docs/VERIFICATION.md.
 */
async function chooseFromRowMenu(page: Page, title: string, option: string): Promise<void> {
  await page.getByRole("button", { name: `Actions for ${title}` }).click();
  await page.getByRole("menuitem", { name: option, exact: true }).click();
}

function rowFor(page: Page, title: string) {
  return page.getByRole("listitem").filter({ hasText: title });
}

/**
 * Reloading after a save is belt and braces now rather than a necessity: since
 * 0.4.1 the editor keeps its own draft and adopts the server's values
 * deliberately, so the next edit no longer races a revalidation. It stays
 * because asserting against a fresh page proves the write actually landed.
 * `editor-draft.spec.ts` is what covers the racing itself.
 */
async function save(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
}

test("a repeat typed into the capture bar is previewed, then filed", async ({ page }) => {
  const title = named("water the plants");

  await page.goto("/");
  const box = page.getByLabel("Capture");
  await box.fill(`${title} every wednesday`);

  // The preview names the day before Enter is pressed. That is what makes the
  // guess acceptable: the box says what it is about to do while it can still be
  // corrected.
  await expect(page.getByText("Every Wednesday", { exact: true })).toBeVisible();
  // And it shows the title it will actually store, without the repeat words.
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await box.press("Enter");
  await expect(box).toHaveValue("");

  // Filed as a repeat, with the badge every other repeating item gets.
  const row = rowFor(page, title);
  await expect(row.getByText("Weekly", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Complete this occurrence of ${title}` }),
  ).toBeVisible();

  // And the editor agrees, because capture writes the same row the editor does.
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByLabel("Repeats")).toHaveValue("weekly");
  await expect(page.getByLabel("Every", { exact: true })).toHaveValue("1");
  await expect(page.getByText(/Every Wednesday/)).toBeVisible();
  await expect(page.getByLabel("Due")).not.toHaveValue("");
});

test("a captured repeat carries a project and a tag with it", async ({ page }) => {
  const title = named("clean the bathroom");

  await page.goto("/");
  await capture(page, `${title} every 2 weeks #chores`);

  const row = rowFor(page, title);
  await expect(row.getByText("Every 2 weeks", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "chores" })).toBeVisible();

  // The title kept none of the metadata, and none of the metadata was lost.
  await expect(row.getByRole("link", { name: title })).toBeVisible();
});

test("a captured repeat advances by its schedule, not by when it was done", async ({ page }) => {
  const title = named("take the recycling out");

  await page.goto("/");
  // Anchored on today, so the next occurrence is a week from today whatever day
  // this suite happens to run on.
  await capture(page, `${title} weekly`);

  const dueToday = rowFor(page, title).getByText("Today", { exact: true });
  await expect(dueToday).toBeVisible();

  await page.getByRole("button", { name: `Complete this occurrence of ${title}` }).click();
  await expect(page.getByText(/Done\. Next:/)).toBeVisible();

  // Still open, still repeating, and no longer due today — the same behaviour a
  // repeat built in the editor gets, which is the point of sharing one path.
  await page.goto("/tasks?kind=all&status=open");
  const afterwards = rowFor(page, title);
  await expect(afterwards.getByText("Weekly", { exact: true })).toBeVisible();
  await expect(afterwards.getByText("Today", { exact: true })).toHaveCount(0);
});

test("a repeating item is completed one occurrence at a time", async ({ page }) => {
  const title = named("take the bins out");

  await page.goto("/");
  await capture(page, `${title} today`);

  const row = rowFor(page, title);
  await expect(row.getByText("Today", { exact: true })).toBeVisible();

  await chooseFromRowMenu(page, title, "Weekly");
  await expect(row.getByText("Weekly", { exact: true })).toBeVisible();

  // The control itself says what it will do, which is the whole point.
  const complete = page.getByRole("button", { name: `Complete this occurrence of ${title}` });
  await expect(complete).toBeVisible();
  await complete.click();

  // The toast is the promise: done, and here is when it comes back.
  await expect(page.getByText(/Done\. Next:/)).toBeVisible();

  // Still open, still repeating, and no longer due today.
  await page.goto("/tasks?kind=all&status=open");
  const afterwards = rowFor(page, title);
  await expect(afterwards.getByText("Weekly", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Complete this occurrence of ${title}` }),
  ).toBeVisible();
  await expect(afterwards.getByText("Today", { exact: true })).toHaveCount(0);

  // And it cannot be finished off by hand either: the editor does not offer it.
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByLabel("Status")).not.toContainText("Done");
});

test("recurrence is created, changed and removed from the item editor", async ({ page }) => {
  const title = named("replace the air filter");

  await page.goto("/");
  await capture(page, `${title} tomorrow`);
  await page.getByRole("link", { name: title }).click();

  // Created. The description is live, so it can be read before saving.
  await page.getByLabel("Repeats").selectOption("monthly");
  await page.getByLabel("Every", { exact: true }).fill("3");
  await expect(page.getByText(/Every 3 months on the/)).toBeVisible();
  await save(page);

  // Changed. A repeating item is never offered "Done" - only its occurrences
  // are finished, and the editor has to say so as plainly as the row does.
  await expect(page.getByLabel("Status")).not.toContainText("Done");
  await page.getByLabel("Repeats").selectOption("weekly");
  await page.getByLabel("Every", { exact: true }).fill("2");
  await expect(page.getByText(/Every 2 weeks on/)).toBeVisible();
  await save(page);
  await expect(page.getByText(/Every 2 weeks on/)).toBeVisible();

  // Removed. The date survives; only the repeat goes.
  await page.getByLabel("Repeats").selectOption("none");
  await save(page);

  await expect(page.getByText(/Every 2 weeks on/)).toHaveCount(0);
  await expect(page.getByLabel("Due")).not.toHaveValue("");
  await expect(page.getByLabel("Status")).toContainText("Done");
});

test("Upcoming shows the days ahead, including repeats that have no row yet", async ({ page }) => {
  const title = named("stretch");

  await page.goto("/");
  await capture(page, `${title} tomorrow`);
  await chooseFromRowMenu(page, title, "Daily");
  await expect(rowFor(page, title).getByText("Daily", { exact: true })).toBeVisible();

  await page.goto("/upcoming");
  await expect(page.getByRole("heading", { level: 1, name: "Upcoming" })).toBeVisible();
  await expect(page.getByText("Tomorrow", { exact: true }).first()).toBeVisible();

  // Tomorrow is the real occurrence; every later day in the window is projected
  // from the rule, so one item appears on all fourteen days without fourteen
  // rows existing anywhere.
  await expect(page.getByRole("link", { name: title })).toHaveCount(14);
});
