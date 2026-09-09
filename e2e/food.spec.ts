import { expect, test } from "@playwright/test";
import { E2E_AUTH_PASSPHRASE } from "./auth-fixtures";

test("food capture persists across web and mobile, with reversible feedback and counts", async ({
  page,
  request,
}, testInfo) => {
  const db = process.env.DATABASE_URL;
  if (
    !db ||
    new URL(db).pathname !== "/tyleros_operations_test" ||
    !["127.0.0.1", "localhost"].includes(new URL(db).hostname)
  )
    throw new Error("Food E2E requires isolated local tyleros_operations_test.");
  const login = await request.post("/api/mobile/session", {
    data: { passphrase: E2E_AUTH_PASSPHRASE },
  });
  expect(login.status()).toBe(200);
  const headers = { Authorization: `Bearer ${(await login.json()).data.token}` };
  const history = async () =>
    (await (await request.get("/api/mobile/consumption", { headers })).json()).data;
  const before = await history();
  const name = "Synthetic burrito " + crypto.randomUUID().slice(0, 8) + " friday @cafe #spicy";
  try {
    await page.goto("/login");
    await page.getByLabel("Passphrase").fill(E2E_AUTH_PASSPHRASE);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/");
    await page.goto("/food");
    await page.getByLabel("Capture", { exact: true }).fill("food: " + name);
    await expect(page.locator("#capture-preview")).toContainText("Log food: " + name);
    await page.getByLabel("Capture", { exact: true }).press("Enter");
    const entry = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(entry).toBeVisible();
    await expect.poll(async () => (await history()).today.food).toBe(before.today.food + 1);
    await entry.getByRole("button", { name: "Like", exact: true }).click();
    await expect(page.getByText(name + ": 1 likes · 0 dislikes", { exact: true })).toBeVisible();
    await entry.getByRole("button", { name: "Remove log", exact: true }).click();
    await expect(entry).toContainText("Removed (not counted)");
    await expect.poll(async () => (await history()).today.food).toBe(before.today.food);
    await expect(page.getByText(name + ": 1 likes · 0 dislikes", { exact: true })).toHaveCount(0);
    await entry.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.getByText(name + ": 1 likes · 0 dislikes", { exact: true })).toBeVisible();
    const drink = {
      requestId: crypto.randomUUID(),
      text: "drink: Synthetic water " + crypto.randomUUID().slice(0, 8),
    };
    const first = await request.post("/api/mobile/capture", { headers, data: drink });
    expect(first.status()).toBe(200);
    expect((await request.post("/api/mobile/capture", { headers, data: drink })).status()).toBe(
      200,
    );
    expect((await history()).today.drink).toBe(before.today.drink + 1);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: drink.text.slice(7), exact: true }),
    ).toBeVisible();
    const today = (await (await request.get("/api/mobile/today", { headers })).json()).data;
    expect(today.consumption).toMatchObject({
      food: before.today.food + 1,
      drink: before.today.drink + 1,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("food-phone-width.png"), fullPage: true });
  } finally {
    await request.delete("/api/mobile/session", { headers });
  }
});
