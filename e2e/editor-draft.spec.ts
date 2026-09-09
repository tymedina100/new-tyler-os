import "dotenv/config";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";

/**
 * The item editor's draft, under the one condition that broke it.
 *
 * React 19 resets a form submitted through its `action` prop as soon as the
 * action resolves, using a raw DOM `form.reset()`. Against a remote database
 * that lands a second or more after the click — long enough for someone to have
 * started their next edit, which was then silently wiped. No unit test can see
 * this: the bug lives in React's commit phase and a real network round trip, so
 * it is covered here or nowhere.
 *
 * A note on synchronisation, because it cost a debugging round: the "Saved."
 * toast is **not** a usable signal. It lingers after one save and expires during
 * the next, so asserting on it passes against a stale toast and then a reload
 * aborts the save still in flight. Wait for the response instead. This is the
 * same trap 0.2 recorded in docs/VERIFICATION.md.
 *
 * These specs WRITE to the database they point at. Everything they create is
 * prefixed and removed afterwards, but point DATABASE_URL at a development
 * database, not one you care about.
 */

const RUN = `ed-${Date.now().toString(36)}`;
const named = (suffix: string) => `${RUN} ${suffix}`;

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

const saveButton = (page: Page) => page.getByRole("button", { name: /Save changes|Saving/ });

/** Arms a wait for the save's round trip, so nothing has to guess at timing. */
function pendingSave(page: Page) {
  return page.waitForResponse(
    (response) => response.request().method() === "POST" && response.status() === 200,
  );
}

/** Clicks Save and waits for the server to have actually answered. */
async function save(page: Page) {
  const done = pendingSave(page);
  await saveButton(page).click();
  await done;
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
}

/**
 * Captures an item and opens its editor.
 *
 * The box clearing is the signal that the capture was written — navigating
 * before it does cancels the write, which 0.2 recorded and this suite has to
 * keep respecting. The generous timeout on the editor is for the dev server's
 * first compile of `/items/[id]`, which is slow enough to fail a 5s assertion
 * when this happens to be the first spec of a cold run.
 */
async function openEditor(page: Page, title: string) {
  await page.goto("/");
  const box = page.getByLabel("Capture", { exact: true });
  await box.fill(title);
  await box.press("Enter");
  await expect(box).toHaveValue("");

  await page.getByRole("link", { name: title }).click();
  await page.waitForURL(/\/items\//);
  await expect(page.getByLabel("Title")).toHaveValue(title, { timeout: 20_000 });
}

test("an edit made while a save is still in flight is not wiped when it lands", async ({
  page,
}) => {
  const title = named("draft race");
  await openEditor(page, title);

  // A first, ordinary edit: give it a date and a monthly repeat, then save.
  await page.getByLabel("Due").fill("2026-09-01");
  await page.getByLabel("Repeats").selectOption("monthly");
  await page.getByLabel("Every", { exact: true }).fill("3");

  const firstSave = pendingSave(page);
  await saveButton(page).click();

  // Deliberately do NOT wait for the save. This is the whole point of the spec:
  // the user carries on typing while the round trip is in the air.
  await page.getByLabel("Title").fill(`${title} carried on`);
  await page.getByLabel("Repeats").selectOption("weekly");
  await page.getByLabel("Every", { exact: true }).fill("2");

  await firstSave;
  // Well past the point where the reset used to land and undo all of the above.
  await page.waitForTimeout(2000);

  await expect(page.getByLabel("Title")).toHaveValue(`${title} carried on`);
  await expect(page.getByLabel("Repeats")).toHaveValue("weekly");
  await expect(page.getByLabel("Every", { exact: true })).toHaveValue("2");
  // The sentence under the controls and the controls themselves must agree — a
  // select reading "Does not repeat" beside "Every 2 weeks" is how the old bug
  // could talk somebody into saving away their own schedule.
  await expect(page.getByText(/Every 2 weeks on/)).toBeVisible();

  // And the second draft is savable, which is what makes it real.
  await save(page);
  await page.reload();

  await expect(page.getByLabel("Title")).toHaveValue(`${title} carried on`);
  await expect(page.getByLabel("Repeats")).toHaveValue("weekly");
  await expect(page.getByLabel("Every", { exact: true })).toHaveValue("2");
});

test("a clean save adopts what the server actually stored", async ({ page }) => {
  const title = named("canonical");
  await openEditor(page, title);

  // The server trims and normalises; with nothing typed after the save, the
  // editor should end up showing what was stored rather than what was typed.
  await page.getByLabel("Title").fill(`   ${title} trimmed   `);
  await page.getByLabel("Tags").fill("Home  HOME");
  await save(page);

  await expect(page.getByLabel("Title")).toHaveValue(`${title} trimmed`);
  // Tag normalisation collapsed two spellings of one tag into one.
  await expect(page.getByLabel("Tags")).toHaveValue("home");
});

test("a failed save keeps the draft and says what was wrong", async ({ page }) => {
  const title = named("rejected");
  await openEditor(page, title);

  await page.getByLabel("Title").fill(`${title} edited`);
  await page.getByLabel("Tags").fill("one two three four five six seven eight nine");
  await save(page);

  await expect(page.getByText(/at most 8 tags/i)).toBeVisible();

  // Nothing the user typed may be thrown away by a rejection.
  await expect(page.getByLabel("Title")).toHaveValue(`${title} edited`);
  await expect(page.getByLabel("Tags")).toHaveValue("one two three four five six seven eight nine");

  // And it recovers: fix the tags, save, and the title edit is still there.
  await page.getByLabel("Tags").fill("one two");
  await save(page);

  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue(`${title} edited`);
  await expect(page.getByLabel("Tags")).toHaveValue("one two");
});

test("several saves in one sitting each land", async ({ page }) => {
  const title = named("sequential");
  await openEditor(page, title);

  for (const note of ["first", "second", "third"]) {
    await page.getByLabel("Notes").fill(note);
    await save(page);
    await expect(page.getByLabel("Notes")).toHaveValue(note);
  }

  await page.reload();
  await expect(page.getByLabel("Notes")).toHaveValue("third");
});

test("a stale web draft cannot overwrite a phone edit and stays available until discarded", async ({
  page,
  request,
}, testInfo) => {
  const title = named("cross device");
  await openEditor(page, title);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const version = await page.locator('input[name="expectedUpdatedAt"]').inputValue();
  await page.getByLabel("Title").fill(named("unsaved web draft"));
  const { E2E_AUTH_PASSPHRASE } = await import("./auth-fixtures");
  const login = await request.post("/api/mobile/session", {
    data: { passphrase: E2E_AUTH_PASSPHRASE },
  });
  expect(login.status()).toBe(200);
  const headers = { Authorization: `Bearer ${(await login.json()).data.token}` };
  const response = await request.patch(`/api/mobile/items/${id}`, {
    headers,
    data: {
      requestId: crypto.randomUUID(),
      expectedUpdatedAt: version,
      title: named("phone edit"),
    },
  });
  expect(response.status()).toBe(200);
  await save(page);
  await expect(page.getByRole("alert").filter({ hasText: "changed elsewhere" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue(named("unsaved web draft"));
  // A second attempt must remain stale; failure cannot silently advance the base.
  await save(page);
  await expect(page.getByRole("alert").filter({ hasText: "changed elsewhere" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue(named("unsaved web draft"));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Discard draft and reload" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("conflict-preserved.png"), fullPage: true });
  await page.getByRole("button", { name: "Discard draft and reload" }).click();
  await expect(page.getByLabel("Title")).toHaveValue(named("phone edit"));
  await page.getByLabel("Title").fill(named("reconciled"));
  await save(page);
  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue(named("reconciled"));
});
