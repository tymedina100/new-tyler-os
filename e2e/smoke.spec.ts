import "dotenv/config";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

/**
 * The things that, if broken, make TylerOS unusable.
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

  // Optimistic: the control flips before the round trip finishes.
  await expect(page.getByRole("button", { name: `Reopen ${title}` })).toBeVisible();

  // Then persisted: revalidation drops it, because a completed item is no
  // longer untriaged. Wait for that before reloading — reloading mid-action
  // cancels the in-flight request and proves nothing about what was written.
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

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

/**
 * Milestone 0.2. The parser has exhaustive unit coverage and the persistence
 * has integration coverage; what only a browser can prove is that a person
 * typing one line gets a filed item, and that the keyboard actually triages.
 */

test("a capture is parsed into a date, a project and a tag", async ({ page }) => {
  const title = capture("renew the registration");

  await page.goto("/");
  await page.getByLabel("Capture").fill(`${title} @TylerOS #admin tomorrow`);

  // The preview promises what will happen before Enter is pressed. Scoped to the
  // preview itself — "Tomorrow" also appears on any item already due tomorrow.
  const preview = page.locator("#capture-preview");
  await expect(preview).toContainText("Tomorrow");
  await expect(preview).toContainText("TylerOS");
  await expect(preview).toContainText("admin");

  await page.getByLabel("Capture").press("Enter");

  // The box clears only once the capture has been written. Navigating before
  // that cancels the request in flight and the item is never created.
  await expect(page.getByLabel("Capture")).toHaveValue("");

  // An inline project is a decision, so the item never passes through the inbox.
  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

  await page.goto("/tasks?kind=all&status=all");
  // The dev server compiles a route on its first hit, which can outlast the
  // default assertion timeout. Wait for the page itself, then assert normally.
  await expect(page.getByRole("heading", { level: 1, name: "Everything" })).toBeVisible({
    timeout: 30_000,
  });
  const row = page.getByRole("listitem").filter({ hasText: title });

  // The tokens became structure, and the title kept only what was left.
  await expect(row.getByRole("link", { name: title, exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "TylerOS" })).toBeVisible();
  await expect(row.getByRole("link", { name: "admin" })).toBeVisible();
  await expect(row.getByText("Tomorrow")).toBeVisible();
});

test("the inbox can be triaged from the keyboard", async ({ page }) => {
  const title = capture("sort the recycling");

  await page.goto("/inbox");
  await page.getByLabel("Capture").fill(title);
  await page.getByLabel("Capture").press("Enter");
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // Land on the page with focus outside any text field, as a person would.
  await page.goto("/inbox");
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();

  // The first keystroke selects, without the mouse being touched. Pressing on a
  // poll rides out hydration: a key sent to a page React has not claimed yet is
  // simply lost, which would make this flaky rather than wrong.
  await expect
    .poll(
      async () => {
        await page.keyboard.press("j");
        return page.locator("li[aria-current='true']").count();
      },
      { timeout: 15_000 },
    )
    .toBe(1);

  // Clicking a row moves the selection there, so the two input methods agree.
  await row.click();
  await expect(row).toHaveAttribute("aria-current", "true");

  // "1" is Task, the first kind. Assigning one is the whole of triage.
  await page.keyboard.press("1");
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

  // Focus is not stranded: whatever took its place is selected and ready.
  await expect(page.locator("li[aria-current='true']")).toHaveCount(1);

  await page.goto("/tasks");
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("typing in the capture bar never triggers a triage shortcut", async ({ page }) => {
  const title = capture("archive plans and sundries");

  await page.goto("/inbox");
  await page.getByLabel("Capture").fill(title);
  await page.getByLabel("Capture").press("Enter");
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // Every one of these letters is a shortcut. In the capture bar they are text.
  await page.goto("/inbox");
  await page.getByLabel("Capture").fill("a s x t 1");
  await expect(page.getByLabel("Capture")).toHaveValue("a s x t 1");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("several inbox items can be marked and triaged in one keystroke", async ({ page }) => {
  const first = capture("rinse the recycling bin");
  const second = capture("descale the kettle");

  await page.goto("/inbox");
  for (const title of [first, second]) {
    await page.getByLabel("Capture").fill(title);
    await page.getByLabel("Capture").press("Enter");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  }

  await page.goto("/inbox");
  await expect
    .poll(
      async () => {
        await page.keyboard.press("j");
        return page.locator("li[aria-current='true']").count();
      },
      { timeout: 15_000 },
    )
    .toBe(1);

  // Space marks and advances, so marking a run costs one key per item.
  for (const title of [first, second]) {
    await page.getByRole("listitem").filter({ hasText: title }).click();
    await page.keyboard.press(" ");
  }
  await expect(page.getByText("2 marked")).toBeVisible();

  // One keystroke decides both.
  await page.keyboard.press("2");
  await expect(page.getByRole("link", { name: first })).toHaveCount(0);
  await expect(page.getByRole("link", { name: second })).toHaveCount(0);
  await expect(page.getByText("2 marked")).toHaveCount(0);

  await page.goto("/tasks?kind=note&status=all");
  await expect(page.getByRole("heading", { level: 1, name: "Notes" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: first })).toBeVisible();
  await expect(page.getByRole("link", { name: second })).toBeVisible();
});
