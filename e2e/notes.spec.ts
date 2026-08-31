import "dotenv/config";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";

/**
 * Notes & Knowledge (0.8), end to end.
 *
 * The rules and the SQL are covered by fast tests (`src/domain/notes/`,
 * `tests/integration/notes.test.ts`, `tests/integration/search.test.ts`).
 * What only a browser proves: markdown actually renders and cannot execute
 * anything, the ADR 024 draft race that already broke once for items does
 * not exist for notes either, the `note:` capture prefix really does route
 * away from the inbox, and every destination this milestone added is
 * reachable the way 0.7's rules said it must be.
 *
 * These specs WRITE to the database they point at. Everything they create is
 * prefixed and removed afterwards, but point DATABASE_URL at a development
 * database, not one you care about.
 */

const RUN = `nt-${Date.now().toString(36)}`;
const named = (suffix: string) => `${RUN} ${suffix}`;

test.afterAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 1 });
  try {
    await sql`delete from notes where title like ${`${RUN}%`}`;
    await sql`delete from items where title like ${`${RUN}%`}`;
    await sql`delete from projects where name like ${`${RUN}%`}`;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
});

const saveButton = (page: Page) => page.getByRole("button", { name: /Save note|Saving/ });

function pendingSave(page: Page) {
  return page.waitForResponse(
    (response) => response.request().method() === "POST" && response.status() === 200,
  );
}

async function save(page: Page) {
  const done = pendingSave(page);
  await saveButton(page).click();
  await done;
  await expect(page.getByRole("button", { name: "Save note" })).toBeEnabled();
}

/** Quick-captures a note from `/notes` and opens its editor. */
async function createNote(page: Page, firstLine: string) {
  await page.goto("/notes");
  const box = page.getByLabel("Note", { exact: true });
  await box.fill(firstLine);
  await page.getByRole("button", { name: /Save note|Saving/ }).click();
  await expect(box).toHaveValue("");

  await page.getByRole("link", { name: firstLine }).click();
  await page.waitForURL(/\/notes\//);
  await expect(page.getByLabel("Title")).toBeVisible({ timeout: 20_000 });
}

test("a note is written, saved, reopened and reads back intact — including markdown structure", async ({
  page,
}) => {
  const title = named("Mazda6 maintenance");
  await createNote(page, title);

  const markdown = [
    "# Mazda6 maintenance",
    "",
    "## Tires",
    "",
    "- Front: 35 psi",
    "- Rear: 33 psi",
    "",
    "1. Rotate every 6000 miles",
    "2. Check tread depth",
    "",
    "- [ ] Book next service",
    "- [x] Replace cabin air filter",
    "",
    "**Torque spec** is *18 ft-lb* for lug nuts.",
    "",
    "`Part number` reference below.",
  ].join("\n");

  await page.getByLabel("Note", { exact: true }).fill(markdown);
  await save(page);

  await page.reload();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue(markdown);

  await page.getByRole("button", { name: "Preview" }).click();

  // Scoped to the rendered preview, not the page as a whole: the page
  // heading above the editor already contains this note's title, and the
  // (now hidden but still present) "Write" textarea contains this exact
  // markdown source too — an unscoped query could match either.
  const preview = page.locator(".note-content");
  await expect(
    preview.getByRole("heading", { level: 1, name: "Mazda6 maintenance" }),
  ).toBeVisible();
  await expect(preview.getByRole("heading", { level: 2, name: "Tires" })).toBeVisible();
  await expect(preview.getByRole("listitem").filter({ hasText: "Front: 35 psi" })).toBeVisible();
  await expect(
    preview.getByRole("listitem").filter({ hasText: "Rotate every 6000" }),
  ).toBeVisible();
  const checkboxes = preview.locator('input[type="checkbox"]');
  await expect(checkboxes).toHaveCount(2);
  await expect(checkboxes.nth(1)).toBeChecked();
  await expect(preview.getByText("Torque spec")).toBeVisible();
});

test("an edit made while a save is still in flight is not wiped when it lands", async ({
  page,
}) => {
  const title = named("draft race");
  await createNote(page, title);

  const firstSave = pendingSave(page);
  await page.getByLabel("Title").fill(`${title} first`);
  await saveButton(page).click();

  // Deliberately not awaited — the whole point is that typing continues
  // while the round trip is still in the air, the same race ADR 024 exists
  // to prevent for items.
  await page.getByLabel("Title").fill(`${title} carried on`);
  await page.getByLabel("Note", { exact: true }).fill("second draft, typed during the save");

  await firstSave;
  await page.waitForTimeout(2000);

  await expect(page.getByLabel("Title")).toHaveValue(`${title} carried on`);
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue(
    "second draft, typed during the save",
  );

  await save(page);
  await page.reload();

  await expect(page.getByLabel("Title")).toHaveValue(`${title} carried on`);
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue(
    "second draft, typed during the save",
  );
});

test("pinning moves a note to the top of the list", async ({ page }) => {
  const older = named("older unpinned");
  const newer = named("newer unpinned");

  await createNote(page, older);
  await createNote(page, newer);

  await page.goto("/notes");
  const rows = page.getByRole("listitem");
  await expect(rows.filter({ hasText: newer }).first()).toBeVisible();

  await page.getByRole("button", { name: `Actions for ${older}` }).click();
  await page.getByRole("menuitem", { name: "Pin" }).click();

  await page.goto("/notes");
  const firstRowTitle = rows.first();
  await expect(firstRowTitle).toContainText(older);
});

test("a tag and a project link both stick, and the note appears on the project page", async ({
  page,
}) => {
  const projectName = named("HomeQuest");
  const title = named("Apartment measurements");

  // A project to link into. The create form sits behind a closed
  // <details>/<summary> disclosure on the projects index.
  await page.goto("/projects");
  await page.getByText("New project", { exact: true }).click();
  await page.getByLabel("Name").fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  const projectLink = page.getByRole("link", { name: projectName });
  await expect(projectLink).toBeVisible();
  const projectHref = await projectLink.getAttribute("href");
  if (!projectHref) throw new Error(`No href on the "${projectName}" project link.`);

  await createNote(page, title);
  await page.getByLabel("Tags").fill("apartment home");
  await page.getByLabel("Project").selectOption({ label: projectName });
  await save(page);

  await page.reload();
  // Tags are a set, not an ordered list — nothing promises the join comes
  // back in the order they were typed.
  const tagsValue = await page.getByLabel("Tags").inputValue();
  expect(tagsValue.split(" ").sort()).toEqual(["apartment", "home"]);
  await expect(page.getByLabel("Project")).toHaveValue(projectHref.split("/").pop() ?? "");

  await page.goto(projectHref);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("a body-only search term finds the note, and opens it", async ({ page }) => {
  const title = named("Car reference");
  await createNote(page, title);

  await page
    .getByLabel("Note", { exact: true })
    .fill("The tire pressure should be kept at 35 psi front and rear.");
  await save(page);

  await page.goto(`/search?q=${encodeURIComponent("tire pressure")}`);
  await expect(page.getByRole("heading", { name: /^Notes/i })).toBeVisible();

  const result = page.getByRole("link", { name: new RegExp(title) });
  await expect(result).toBeVisible();
  await result.click();

  await page.waitForURL(/\/notes\//);
  await expect(page.getByLabel("Title")).toHaveValue(title);
});

test("the note: prefix in the global capture box creates a note, never an item", async ({
  page,
}) => {
  const title = named("Mazda6 tire pressure is 35 psi");

  await page.goto("/");
  const box = page.getByLabel("Capture");
  await box.fill(`note: ${title}`);
  await box.press("Enter");
  await expect(box).toHaveValue("");

  await page.goto("/notes");
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("deleting a note asks first, and a cancelled confirm keeps it", async ({ page }) => {
  const title = named("to be deleted");
  await createNote(page, title);

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByLabel("Title")).toHaveValue(title);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/notes$/);
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("creating a task from a note adds an ordinary item and leaves the note untouched", async ({
  page,
}) => {
  const title = named("Renovation ideas");
  await createNote(page, title);
  await page.getByLabel("Note", { exact: true }).fill("Paint the kitchen a lighter colour.");
  await save(page);

  const taskTitle = named("paint the kitchen");
  await page.getByRole("button", { name: "Create task from this note" }).click();
  await page.getByLabel("Task title").fill(taskTitle);
  await page.getByRole("button", { name: "Add to inbox" }).click();
  await expect(page.getByText("Added to your inbox")).toBeVisible();

  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: taskTitle })).toBeVisible();

  await page.goto("/notes");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("hostile markdown never executes and dangerous links are neutralised", async ({ page }) => {
  const title = named("hostile content");

  // A sentinel the page itself can never set legitimately — only an
  // executed script (from the note body, which nothing here typed on
  // purpose) could flip it.
  await page.addInitScript(() => {
    (window as unknown as { __xss: boolean }).__xss = false;
  });

  await createNote(page, title);
  const hostile = [
    "<script>window.__xss = true</script>",
    "",
    '<img src=x onerror="window.__xss = true">',
    "",
    "[click me](javascript:window.__xss=true)",
    "",
    "```html",
    "<script>window.__xss = true</script>",
    "```",
  ].join("\n");

  await page.getByLabel("Note", { exact: true }).fill(hostile);
  await save(page);

  await page.getByRole("button", { name: "Preview" }).click();

  // Scoped to the rendered preview: the (now hidden but still present)
  // "Write" textarea contains this exact source text too, and an unscoped
  // query would match the hidden textarea before ever reaching the visible
  // preview.
  const preview = page.locator(".note-content");
  // The literal tag text is visible as inert text, not executed as HTML.
  await expect(preview.getByText("<script>window.__xss = true</script>").first()).toBeVisible();

  const dangerousLink = preview.getByRole("link", { name: "click me" });
  await expect(dangerousLink).toBeVisible();
  const href = await dangerousLink.getAttribute("href");
  expect(href).not.toContain("javascript:");

  expect(await page.evaluate(() => (window as unknown as { __xss: boolean }).__xss)).toBe(false);
});

test("the command palette's New note never submits a bare note: with an empty query", async ({
  page,
}) => {
  await page.goto("/");
  // Exactly one press: the app's own listener toggles open/closed on either
  // modifier, so pressing both would open it and immediately close it again.
  await page.keyboard.press("Control+k");

  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.getByRole("option", { name: "New note" }).click();

  await page.waitForURL(/\/notes$/);
  // Nothing titled a literal "note:" was created — an empty query must never
  // reach captureAction at all.
  await expect(page.getByRole("link", { name: "note:", exact: true })).toHaveCount(0);
});
