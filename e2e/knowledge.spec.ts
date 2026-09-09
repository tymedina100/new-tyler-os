import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { knowledgeFixture, boardFixture } from "../tests/support/knowledge-fixtures";
import { E2E_AUTH_PASSPHRASE } from "./auth-fixtures";

test("source failures stay independent, dated context remains honest, and repaired imports recover", async ({
  page,
  request,
}, testInfo) => {
  const db = process.env.DATABASE_URL;
  if (
    !db ||
    new URL(db).pathname !== "/tyleros_operations_test" ||
    !["127.0.0.1", "localhost"].includes(new URL(db).hostname)
  )
    throw new Error("Knowledge E2E requires isolated local tyleros_operations_test.");
  const knowledge = path.resolve("../work/knowledge-e2e.json"),
    board = path.resolve("../work/board-e2e.json");
  await mkdir(path.dirname(knowledge), { recursive: true });
  await writeFile(knowledge, "broken fixture");
  await writeFile(board, JSON.stringify(boardFixture()));
  const login = await request.post("/api/mobile/session", {
    data: { passphrase: E2E_AUTH_PASSPHRASE },
  });
  expect(login.status()).toBe(200);
  const headers = { Authorization: `Bearer ${(await login.json()).data.token}` };
  try {
    await page.goto("/login");
    await page.getByLabel("Passphrase").fill(E2E_AUTH_PASSPHRASE);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/");
    await page.goto("/knowledge");
    await expect(page.getByRole("status")).toContainText("could not be loaded");
    await expect(page.getByRole("link", { name: "Synthetic shared work" })).toBeVisible();
    const failed = await request.get("/api/mobile/knowledge", { headers });
    expect(failed.status()).toBe(200);
    expect((await failed.json()).data.health.status).toBe("unavailable");
    expect((await request.get("/api/mobile/notes", { headers })).status()).toBe(200);
    expect((await request.get("/api/mobile/today", { headers })).status()).toBe(200);
    await writeFile(knowledge, JSON.stringify(knowledgeFixture(new Date().toISOString())));
    await writeFile(board, "broken fixture");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Synthetic household routine" })).toBeVisible();
    await expect(page.getByText(/Review due since 2020-01-08/)).toBeVisible();
    await expect(page.getByText(/Shared Work Board could not be loaded/)).toBeVisible();
    const repaired = await request.get("/api/mobile/knowledge", { headers });
    const data = (await repaired.json()).data;
    expect(data.health.status).toBe("available");
    expect(data.entries[0].sourceHealth.reviewStatus).toBe("due");
    expect(data.entries[0].sourceHealth.importMessage).not.toContain("less than a day");
    await writeFile(board, JSON.stringify(boardFixture()));
    await page.reload();
    await expect(page.getByRole("link", { name: "Synthetic shared work" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("knowledge-source-health.png"),
      fullPage: true,
    });
  } finally {
    await request.delete("/api/mobile/session", { headers });
  }
});
