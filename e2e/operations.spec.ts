import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/server/db/schema";
import { bootstrapRuntime } from "../src/server/runtime/fleet-service";
import { E2E_AUTH_PASSPHRASE } from "./auth-fixtures";

const exec = promisify(execFile);
test("Today surfaces actual Python proposals, then a saved note after approval", async ({
  page,
  request,
}, testInfo) => {
  const database = process.env.DATABASE_URL;
  if (
    !database ||
    new URL(database).pathname !== "/tyleros_operations_test" ||
    !["localhost", "127.0.0.1"].includes(new URL(database).hostname)
  )
    throw new Error("Operations E2E requires the isolated local tyleros_operations_test database.");
  const sql = postgres(database, { max: 2 });
  const db = drizzle(sql, { schema });
  try {
    await sql`truncate approvals, runs, jobs, items, notes, runtimes cascade`;
    expect((await request.get("/api/mobile/today")).status()).toBe(401);
    const login = await request.post("/api/mobile/session", {
      data: { passphrase: E2E_AUTH_PASSPHRASE },
    });
    expect(login.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await login.json()).data.token}` };
    const capture = await request.post("/api/mobile/capture", {
      headers,
      data: { requestId: randomUUID(), text: "Synthetic operations check" },
    });
    expect(capture.status()).toBe(200);
    const worker = await bootstrapRuntime(db, {
      instanceKey: `operations-${randomUUID()}`,
      name: "Synthetic operations worker",
      kind: "python",
      roles: ["miles"],
    });
    const runWorker = () =>
      exec(
        "python3",
        [path.resolve(process.env.TYLEROS_WORKER_PATH ?? "../worker/tyleros_worker.py"), "--once"],
        {
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH,
            TYLEROS_URL: testInfo.project.use.baseURL,
            TYLEROS_RUNTIME_CREDENTIAL: worker.token,
          },
          timeout: 60000,
        },
      );
    await request.post("/api/mobile/requests", {
      headers,
      data: { requestId: randomUUID(), kind: "today_briefing" },
    });
    expect((await runWorker()).stdout).toContain("Proposed note");
    await page.goto("/login");
    await page.getByLabel("Passphrase").fill(E2E_AUTH_PASSPHRASE);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/");
    const strip = page.getByRole("region", { name: "Miles operations" });
    await expect(strip).toContainText("1 proposal waiting");
    await expect(page.getByText("Nothing needs you right now")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("operations-pending.png"), fullPage: true });
    await strip.getByRole("link", { name: "Review Miles activity" }).click();
    await expect(page).toHaveURL(/\/runs$/);
    const board = (await (await request.get("/api/mobile/jobs", { headers })).json()).data.jobs;
    const approvalId = board[0].pendingApproval.id;
    const accept = await request.post(`/api/mobile/approvals/${approvalId}`, {
      headers,
      data: { requestId: randomUUID(), decision: "accept" },
    });
    expect(accept.status()).toBe(200);
    const today = (await (await request.get("/api/mobile/today", { headers })).json()).data;
    expect(today.operations).toMatchObject({ pendingApprovals: 0, savedNotes: 1, failedJobs: 0 });
    await page.goto("/");
    await expect(strip).toContainText("1 briefing note saved");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("operations-phone.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await request.post("/api/mobile/requests", {
      headers,
      data: { requestId: randomUUID(), kind: "today_briefing" },
    });
    await runWorker();
    const nextBoard = (await (await request.get("/api/mobile/jobs", { headers })).json()).data.jobs;
    expect(nextBoard[0].pendingApproval.body).toContain("1 briefing note saved");
    expect(nextBoard[0].pendingApproval.body).toContain("Synthetic operations check");
    await request.delete("/api/mobile/session", { headers });
  } finally {
    await sql.end();
  }
});
