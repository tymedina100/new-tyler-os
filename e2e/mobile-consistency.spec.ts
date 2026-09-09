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
const DATABASE = "postgresql://tyleros_local@localhost:55432/tyleros_mobile_test";
const RUN = `synthetic-mobile-${Date.now().toString(36)}`;

test("authenticated mobile capture and web edits share canonical state; actual Python run waits for approval", async ({
  page,
  playwright,
}, testInfo) => {
  // Dedicated throwaway local database. No seed command or personal import is run.
  const sql = postgres(DATABASE, { max: 2 });
  const [identity] = await sql`select current_database() as name`;
  expect(identity?.name).toBe("tyleros_mobile_test");
  const db = drizzle(sql, { schema });
  const api = await playwright.request.newContext({ baseURL: "http://localhost:3001" });
  let token = "";
  try {
    // Reset only this explicitly fixed isolated fixture database between runs.
    await sql.unsafe(`DO $$ DECLARE tables text; BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO tables FROM pg_tables WHERE schemaname = 'public';
      IF tables IS NOT NULL THEN EXECUTE 'TRUNCATE ' || tables || ' CASCADE'; END IF;
    END $$;`);
    expect((await api.get("/api/mobile/items")).status()).toBe(401);
    const login = await api.post("/api/mobile/session", {
      data: { passphrase: E2E_AUTH_PASSPHRASE },
    });
    expect(login.status()).toBe(200);
    token = (await login.json()).data.token;
    const headers = { Authorization: `Bearer ${token}` };
    const capture = { requestId: randomUUID(), text: `${RUN} review release checklist` };
    const created = await api.post("/api/mobile/capture", { headers, data: capture });
    expect(created.status()).toBe(200);
    const { data: item } = await created.json();
    expect(item.entityType).toBe("item");
    const repeated = await api.post("/api/mobile/capture", { headers, data: capture });
    expect((await repeated.json()).data.id).toBe(item.id);
    const initialItems = (await (await api.get("/api/mobile/items", { headers })).json()).data
      .items;
    expect(initialItems.filter((row: { id: string }) => row.id === item.id)).toHaveLength(1);
    const initial = initialItems.find((row: { id: string }) => row.id === item.id);

    await page.goto("/login");
    await page.getByLabel("Passphrase").fill(E2E_AUTH_PASSPHRASE);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("http://localhost:3001/");
    await expect(page.getByRole("link", { name: capture.text, exact: true })).toBeVisible();
    await page.getByRole("link", { name: capture.text, exact: true }).click();
    await expect(page.getByLabel("Title")).toHaveValue(capture.text);
    const edited = `${RUN} edited on web`;
    await page.getByLabel("Title").fill(edited);
    const save = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.status() === 200,
    );
    await page.getByRole("button", { name: "Save changes" }).click();
    await save;
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
    const afterWeb = (
      await (await api.get("/api/mobile/items", { headers })).json()
    ).data.items.find((row: { id: string }) => row.id === item.id);
    expect(afterWeb.title).toBe(edited);
    const stale = await api.patch(`/api/mobile/items/${item.id}`, {
      headers,
      data: {
        requestId: randomUUID(),
        expectedUpdatedAt: initial.updatedAt,
        title: `${RUN} stale overwrite`,
      },
    });
    expect(stale.status()).toBe(409);
    const mobileTitle = `${RUN} edited on mobile`;
    const mobileEdit = await api.patch(`/api/mobile/items/${item.id}`, {
      headers,
      data: {
        requestId: randomUUID(),
        expectedUpdatedAt: afterWeb.updatedAt,
        title: mobileTitle,
      },
    });
    expect(mobileEdit.status()).toBe(200);
    await page.reload();
    await expect(page.getByLabel("Title")).toHaveValue(mobileTitle);
    await page.screenshot({
      path: testInfo.outputPath("01-two-way-item-edit.png"),
      fullPage: true,
    });

    const request = await api.post("/api/mobile/requests", {
      headers,
      data: { requestId: randomUUID(), kind: "today_briefing" },
    });
    expect(request.status()).toBe(200);
    const job = (await request.json()).data;
    const worker = await bootstrapRuntime(db, {
      instanceKey: RUN,
      name: "Synthetic mobile E2E worker",
      kind: "python",
      roles: ["miles"],
    });
    // The token stays in this subprocess environment and is never printed or attached.
    const completed = await exec(
      "python3",
      [path.resolve("../tyler-ai-assistant/tyleros_worker.py"), "--once"],
      {
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH,
          TYLEROS_URL: "http://localhost:3001",
          TYLEROS_RUNTIME_CREDENTIAL: worker.token,
        },
        timeout: 60_000,
      },
    );
    expect(completed.stdout).toContain("Proposed note");
    const board = (await (await api.get("/api/mobile/jobs", { headers })).json()).data.jobs;
    const row = board.find((entry: { job: { id: string } }) => entry.job.id === job.id);
    expect(row.job.status).toBe("needs_approval");
    const usage = await sql`select provider from usage_entries where run_id = ${row.latestRun.id}`;
    expect(usage).toHaveLength(1);
    expect(usage[0]?.provider).toBe("none");
    expect(row.pendingApproval.body).toContain(mobileTitle);
    const beforeNotes = (await (await api.get("/api/mobile/notes", { headers })).json()).data.notes;
    expect(beforeNotes).toHaveLength(0);
    await page.goto("/runs");
    await expect(page.getByText(row.pendingApproval.title, { exact: true }).first()).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("02-runtime-awaiting-approval.png"),
      fullPage: true,
    });
    const decision = { requestId: randomUUID(), decision: "accept" };
    expect(
      (
        await api.post(`/api/mobile/approvals/${row.pendingApproval.id}`, {
          headers,
          data: decision,
        })
      ).status(),
    ).toBe(200);
    // A retry of the identical decision produces one note, not another write.
    expect(
      (
        await api.post(`/api/mobile/approvals/${row.pendingApproval.id}`, {
          headers,
          data: decision,
        })
      ).status(),
    ).toBe(200);
    const notes = (await (await api.get("/api/mobile/notes", { headers })).json()).data.notes;
    expect(notes).toHaveLength(1);
    await page.goto(`/notes/${notes[0].id}`);
    await expect(page.getByLabel("Note", { exact: true })).toHaveValue(new RegExp(mobileTitle));
    await page.screenshot({
      path: testInfo.outputPath("03-accepted-canonical-note.png"),
      fullPage: true,
    });
    await testInfo.attach("verification.json", {
      contentType: "application/json",
      body: JSON.stringify(
        {
          fixturePrefix: RUN,
          database: "tyleros_mobile_test",
          captureId: item.id,
          jobId: job.id,
          noteId: notes[0].id,
          worker: "actual Python stdlib --once",
          provider: "none",
          checks: [
            "unauthenticated 401",
            "capture retry dedupe",
            "mobile to web",
            "web to mobile",
            "stale edit 409",
            "Python claim complete",
            "no note before approval",
            "approval retry exactly one note",
          ],
        },
        null,
        2,
      ),
    });
  } finally {
    if (token)
      await api.delete("/api/mobile/session", { headers: { Authorization: `Bearer ${token}` } });
    await api.dispose();
    await sql.end();
  }
});
