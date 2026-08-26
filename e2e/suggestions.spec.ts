import "dotenv/config";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";

/**
 * AI suggestions, end to end — with no AI anywhere in the run.
 *
 * The provider is not mocked here, it is **absent**. Proposals are written
 * straight into `item_suggestions`, which is exactly what a real run would
 * leave behind, and every assertion below is about what happens afterwards:
 * whether a chip appears, whether accepting it writes through the ordinary
 * item path, and whether a stale one can undo a choice the user made.
 *
 * That is deliberate. A spec that called a live model would be a spec that
 * fails on a Tuesday because a sentence was labelled `note` instead of `task`,
 * and a flaky suite is a suite people switch off. The classification itself is
 * covered where it can be covered honestly: pure rules in the domain tests, and
 * a substituted classifier in tests/integration/suggestions.test.ts.
 *
 * These specs WRITE to the database they point at. Everything is prefixed and
 * removed afterwards — point DATABASE_URL at a development database.
 */

const RUN = `sg-${Date.now().toString(36)}`;
const named = (suffix: string) => `${RUN} ${suffix}`;

const MODEL = "e2e-fixture";

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required. Run pnpm check:env.");
  return postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 1 });
}

test.afterAll(async () => {
  const sql = connect();
  try {
    // item_suggestions cascades from items; the projects are ours to remove.
    await sql`delete from items where title like ${`${RUN}%`}`;
    await sql`delete from projects where name like ${`${RUN}%`}`;
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

async function itemIdFor(title: string): Promise<string> {
  const sql = connect();
  try {
    const [row] = await sql<{ id: string }[]>`select id from items where title = ${title} limit 1`;
    if (!row) throw new Error(`No item titled "${title}".`);
    return row.id;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

/**
 * Project names are unique on `lower(name)`, and the specs here share one run
 * prefix — so a plain `named("Home")` in two tests is a unique violation, and
 * one that only appears when the whole file runs in order. The counter makes
 * every fixture project distinct without the caller having to remember.
 */
let projectSequence = 0;

async function createProject(label: string): Promise<{ id: string; name: string }> {
  const name = `${RUN} ${label} ${(projectSequence += 1)}`;
  const sql = connect();
  try {
    const [row] = await sql<
      { id: string }[]
    >`insert into projects (name, status) values (${name}, 'active') returning id`;
    if (!row) throw new Error(`Could not create project "${name}".`);
    return { id: row.id, name };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

/**
 * What a completed suggestion pass leaves behind.
 *
 * `observed_title` and `observed_value` are written exactly as the service
 * writes them, because they are what the staleness check reads — a fixture
 * that fudged them would prove nothing about the behaviour that matters most.
 */
async function proposeKind(itemId: string, title: string, kind: string): Promise<void> {
  const sql = connect();
  try {
    await sql`
      insert into item_suggestions (item_id, field, kind, model, observed_title, observed_value)
      values (${itemId}, 'kind', ${kind}, ${MODEL}, ${title}, 'note')`;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

async function proposeProject(itemId: string, title: string, projectId: string): Promise<void> {
  const sql = connect();
  try {
    await sql`
      insert into item_suggestions (item_id, field, project_id, model, observed_title, observed_value)
      values (${itemId}, 'project', ${projectId}, ${MODEL}, ${title}, '')`;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

function rowFor(page: Page, title: string) {
  return page.getByRole("listitem").filter({ hasText: title });
}

test("a suggestion is offered, accepted, and applied to the item", async ({ page }) => {
  const title = named("replace air filter");

  await page.goto("/");
  await capture(page, title);

  const itemId = await itemIdFor(title);
  const project = await createProject("Home");
  await proposeKind(itemId, title, "task");
  await proposeProject(itemId, title, project.id);

  await page.goto("/inbox");
  const row = rowFor(page, title);

  // Visibly a proposal, and visibly separate from what the parser knew.
  await expect(row.getByText("Suggested")).toBeVisible();

  // Accepting one, not both. Partial acceptance is the whole interaction.
  await row.getByRole("button", { name: `File under ${project.name}` }).click();

  await expect(page.getByText(`Filed under ${project.name}.`)).toBeVisible();

  // The canonical item changed, through the ordinary item path.
  await page.goto(`/items/${itemId}`);
  await expect(page.getByLabel("Project")).toHaveValue(project.id);

  // The type suggestion survived its sibling being accepted, and the type
  // itself was left exactly as it was.
  await expect(page.getByRole("button", { name: "Set type to Task" })).toBeVisible();
  // `exact`, because the chip beside it is labelled "Set type to Task" and
  // Playwright's default label matching is a substring match.
  await expect(page.getByLabel("Type", { exact: true })).toHaveValue("note");
});

test("a suggestion can be waved away without touching the item", async ({ page }) => {
  const title = named("look into standing desk arms");

  await page.goto("/");
  await capture(page, title);

  const itemId = await itemIdFor(title);
  await proposeKind(itemId, title, "idea");

  await page.goto("/inbox");
  const row = rowFor(page, title);
  await expect(row.getByText("Suggested")).toBeVisible();

  await row.getByRole("button", { name: "Not now" }).click();

  // Gone, and not coming back — a dismissed proposal is resolved, not deleted.
  await expect(row.getByText("Suggested")).toBeHidden();

  await page.reload();
  await expect(rowFor(page, title).getByText("Suggested")).toBeHidden();

  // The item is untouched: still an untriaged note.
  await page.goto(`/items/${itemId}`);
  // `exact`, because the chip beside it is labelled "Set type to Task" and
  // Playwright's default label matching is a substring match.
  await expect(page.getByLabel("Type", { exact: true })).toHaveValue("note");
  await expect(page.getByLabel("Status")).toHaveValue("inbox");
});

test("a stale suggestion cannot undo a choice the user made first", async ({ page }) => {
  const title = named("clean the gutters");

  await page.goto("/");
  await capture(page, title);

  const itemId = await itemIdFor(title);
  const suggested = await createProject("Home");
  const chosen = await createProject("Outside");
  await proposeProject(itemId, title, suggested.id);

  // The user files it themselves, in the editor, before getting to the chip.
  await page.goto(`/items/${itemId}`);
  await page.getByLabel("Project").selectOption(chosen.id);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: `File under ${suggested.name}` }).click();

  // Told plainly that nothing happened, rather than a success toast that lied.
  await expect(page.getByText(/Kept your own choice/)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Project")).toHaveValue(chosen.id);
});
