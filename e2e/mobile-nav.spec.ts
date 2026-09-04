import { expect, test } from "@playwright/test";

/**
 * The phone-shaped shell, end to end.
 *
 * Seven destinations no longer fit as seven permanently visible tabs, so the
 * bottom bar carries four daily things plus a fifth slot that opens the rest.
 * This proves every destination TylerOS has is still reachable in one or two
 * taps, that capture needs exactly one, and that nothing spills sideways at
 * the narrowest width TylerOS supports.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
});

test("the four daily destinations are one tap away", async ({ page }) => {
  await page.goto("/");
  const bottomBar = page.getByRole("navigation").filter({ hasText: "Today" });

  await bottomBar.getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/inbox$/);

  await bottomBar.getByRole("link", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search$/);

  await bottomBar.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
});

test("capture is reachable in one tap, and focuses the box every screen has", async ({ page }) => {
  await page.goto("/inbox");

  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByLabel("Capture")).toBeFocused();
});

test("the More sheet reaches every remaining destination", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More destinations" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "More" })).toBeVisible();

  for (const label of [
    "Upcoming",
    "Tasks",
    "Projects",
    "Notes",
    "Kitchen",
    "Shopping list",
    "Runs",
    "Capacity",
  ]) {
    await expect(sheet.getByRole("link", { name: label })).toBeVisible();
  }

  await sheet.getByRole("link", { name: "Kitchen" }).click();
  await expect(page).toHaveURL(/\/kitchen$/);
});

test("the More sheet can sign out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More destinations" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Sign out" })).toBeVisible();
  // Not clicked here — e2e/auth.spec.ts owns the actual sign-out assertion,
  // so every other spec in this suite keeps its inherited session.
});

test("the bottom bar meets the 44px tap-target floor", async ({ page }) => {
  await page.goto("/");
  const bottomBar = page.getByRole("navigation").filter({ hasText: "Today" });

  for (const box of await bottomBar.locator("a, button").all()) {
    const height = (await box.boundingBox())?.height ?? 0;
    expect(height).toBeGreaterThanOrEqual(44);
  }
});

test("nothing spills sideways at 375px, on the page or in the sheet", async ({ page }) => {
  for (const route of ["/", "/kitchen", "/projects"]) {
    await page.goto(route);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth, `${route} should not scroll horizontally`).toBeLessThanOrEqual(
      overflow.clientWidth,
    );
  }

  await page.getByRole("button", { name: "More destinations" }).click();
  const overflowWithSheetOpen = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflowWithSheetOpen.scrollWidth).toBeLessThanOrEqual(overflowWithSheetOpen.clientWidth);
});

test("the desktop sidebar keeps every destination visible, unlike the phone bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  for (const destination of [
    "Today",
    "Upcoming",
    "Inbox",
    "Tasks",
    "Projects",
    "Notes",
    "Kitchen",
    "Search",
    "Runs",
    "Capacity",
  ]) {
    await expect(page.getByRole("link", { name: destination }).first()).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "More destinations" })).toBeHidden();
});
