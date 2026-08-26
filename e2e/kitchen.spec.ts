import "dotenv/config";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";

/**
 * Kitchen inventory, end to end.
 *
 * The rules and the SQL are covered by fast tests; what only a browser proves is
 * that a structured domain which is deliberately *not* an Item still behaves
 * like part of TylerOS — it is reachable, editable, findable by the one search
 * box, and able to hand something to the shopping list.
 *
 * These specs WRITE to the database they point at. Everything they create is
 * prefixed and removed afterwards, but point DATABASE_URL at a development
 * database, not one you care about.
 */

const RUN = `kt-${Date.now().toString(36)}`;
const named = (suffix: string) => `${RUN} ${suffix}`;

test.afterAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 1 });
  try {
    await sql`delete from kitchen_inventory where name like ${`${RUN}%`}`;
    await sql`delete from items where title like ${`${RUN}%`}`;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
});

/** Adding is a plain form post, so it works before the page has hydrated. */
function quickAdd(page: Page) {
  // Scoped to the form: "Location" also matches the location nav, and Next's
  // route announcer is itself a role="alert".
  return page.getByRole("form", { name: "Add to the kitchen" });
}

async function addInventory(
  page: Page,
  fields: { name: string; quantity?: string; unit?: string; location: string },
) {
  const form = quickAdd(page);
  await form.getByLabel("Name", { exact: true }).fill(fields.name);
  if (fields.quantity) await form.getByLabel("Quantity", { exact: true }).fill(fields.quantity);
  if (fields.unit) await form.getByLabel("Unit", { exact: true }).fill(fields.unit);
  await form.getByLabel("Location", { exact: true }).selectOption(fields.location);
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("link", { name: fields.name })).toBeVisible();
}

test("inventory is added, filtered by location, edited and used up", async ({ page }) => {
  const name = named("chicken breast");

  await page.goto("/kitchen");
  await expect(page.getByRole("heading", { level: 1, name: "Kitchen" })).toBeVisible();

  // --- added, with a measured quantity -----------------------------------
  await addInventory(page, { name, quantity: "2", unit: "lb", location: "freezer" });

  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row.getByText("2 lb")).toBeVisible();
  await expect(row.getByText("Freezer")).toBeVisible();

  // --- shows under its own location, and not under another ----------------
  await page.goto("/kitchen?location=freezer");
  await expect(page.getByRole("link", { name })).toBeVisible();

  await page.goto("/kitchen?location=pantry");
  await expect(page.getByRole("link", { name })).toHaveCount(0);

  // --- quantity is edited after using some of it --------------------------
  await page.goto("/kitchen?location=freezer");
  await page.getByRole("link", { name }).click();

  // Waiting for the editor first: the list page has its own Quantity field in
  // the quick-add row, so a bare getByLabel can resolve against the page being
  // navigated away from. See the 0.3 note in docs/VERIFICATION.md.
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
  await expect(page.getByLabel("Quantity")).toHaveValue("2");

  await page.getByLabel("Quantity").fill("1.3");
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.goto("/kitchen?location=freezer");
  await expect(
    page.getByRole("listitem").filter({ hasText: name }).getByText("1.3 lb"),
  ).toBeVisible();

  // --- found by the one search box, labelled as kitchen, not as an item ---
  // The group was "In the kitchen" when it was the only thing beside items.
  // Since 0.6 search reaches three domains and the headings are parallel
  // nouns - Items, Projects, Kitchen - but the point of the assertion is
  // unchanged: this record is shown as kitchen, and never folded into items.
  await page.goto(`/search?q=${encodeURIComponent(RUN)}`);
  await expect(page.getByRole("heading", { name: /^Kitchen/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Items/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();

  // --- used up: the record goes and the shopping list gains a line --------
  await page.goto("/kitchen?location=freezer");
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Used it up" }).click();

  await expect(page.getByRole("link", { name })).toHaveCount(0);

  await page.goto("/kitchen/shopping");
  await expect(page.getByRole("link", { name: `${name} (lb)` })).toBeVisible();
});

test("a shopping line is added, bought, and put away into the kitchen", async ({ page }) => {
  const name = named("oat milk");

  await page.goto("/kitchen/shopping");
  await page.getByLabel("Shopping item").fill(name);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("link", { name })).toBeVisible();

  // Purchased through the ordinary completion toggle: it is an item, so nothing
  // about buying it needed a second implementation.
  await page.getByRole("button", { name: `Complete ${name}` }).click();
  await expect(page.getByRole("heading", { name: /Bought/i })).toBeVisible();

  // Putting it away carries the name across rather than making the user retype.
  await page.getByRole("button", { name: `Put away ${name}` }).click();
  await page.getByRole("menuitem", { name: "Fridge" }).click();

  await expect(page).toHaveURL(/\/kitchen\?location=fridge/);
  await expect(page.getByLabel("Name")).toHaveValue(name);

  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("link", { name })).toBeVisible();

  // It is in the fridge, which on a filtered page means present here and absent
  // there — the location badge is hidden when the list is already one location.
  await page.goto("/kitchen?location=pantry");
  await expect(page.getByRole("link", { name })).toHaveCount(0);

  await page.goto("/kitchen");
  await expect(
    page.getByRole("listitem").filter({ hasText: name }).getByText("Fridge"),
  ).toBeVisible();
});

test("expiring food is surfaced on Today without taking the page over", async ({ page }) => {
  const name = named("single cream");
  const soon = new Date();
  soon.setDate(soon.getDate() + 1);
  const tomorrow = soon.toISOString().slice(0, 10);

  await page.goto("/kitchen");
  await addInventory(page, { name, location: "fridge" });

  await page.getByRole("link", { name }).click();
  await page.getByLabel("Best by").fill(tomorrow);
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.goto("/");
  const useSoon = page
    .locator("main section")
    .filter({ has: page.locator("h2", { hasText: /use soon/i }) });

  await expect(useSoon.getByRole("link", { name: new RegExp(name) })).toBeVisible();

  // Today is still a work screen: the food sits after the item sections.
  const headings = await page.locator("main section > h2").allInnerTexts();
  expect(headings.at(-1)?.toLowerCase()).toContain("use soon");
});

test("the kitchen refuses input that would make it untrue", async ({ page }) => {
  await page.goto("/kitchen");

  // A blank name is refused inline rather than silently ignored.
  await quickAdd(page).getByRole("button", { name: "Add" }).click();
  await expect(quickAdd(page).getByRole("alert")).toContainText(/name/i);

  // A negative quantity is refused, and the record is not created.
  const name = named("negative test");
  const form = quickAdd(page);
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByLabel("Quantity", { exact: true }).fill("-5");
  await form.getByRole("button", { name: "Add" }).click();

  await expect(form.getByRole("alert")).toContainText(/negative/i);
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});
