import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { AuthConfig } from "@/server/auth/auth-config";
import {
  createMobileSession,
  MOBILE_SESSION_MS,
  requireMobileSession,
  hashMobileValue,
} from "@/server/mobile/mobile-auth";
import { handleMobileRequest } from "@/server/mobile/mobile-http";
import { revokeSession } from "@/server/mobile/mobile-repository";
import * as itemService from "@/server/items/item-service";
import * as noteService from "@/server/notes/note-service";
import * as runtimeService from "@/server/runtime/runtime-service";
import { registerMilesRuntime } from "../support/runtime-fixtures";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

let harness: TestDatabase;
let token: string;
const config: AuthConfig = {
  mode: "guarded",
  passphrase: "synthetic-mobile-passphrase",
  secret: "synthetic-secret-used-only-in-isolated-tests",
};
beforeAll(async () => {
  harness = await createTestDatabase();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.truncate();
  await harness.db.execute(
    sql`truncate mobile_sessions, mobile_login_limits, mobile_mutation_receipts`,
  );
  token = (await createMobileSession(harness.db, config, config.passphrase)).token;
});
function call(path: string, method = "GET", body?: unknown, bearer: string | null = token) {
  return handleMobileRequest(
    harness.db,
    config,
    new Request(`http://localhost/api/mobile/${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    path.split("?")[0]!.split("/"),
  );
}
async function data<T>(response: Response): Promise<T> {
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: T }).data;
}
describe("mobile authentication", () => {
  it("fails closed in open development, rejects runtime/cookie credentials and returns no-store", async () => {
    for (const bearer of [
      null,
      "runtime-token-that-is-not-a-mobile-session",
      "tym1_" + "x".repeat(43),
    ]) {
      const response = await call("today", "GET", undefined, bearer);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    const response = await handleMobileRequest(
      harness.db,
      { mode: "open" },
      new Request("http://localhost/api/mobile/today"),
      ["today"],
    );
    expect(response.status).toBe(503);
  });
  it("expires, revokes and invalidates tokens when the server secrets rotate", async () => {
    const now = new Date("2026-09-09T00:00:00Z");
    const session = await createMobileSession(harness.db, config, config.passphrase, now);
    await requireMobileSession(harness.db, config, `Bearer ${session.token}`, now);
    await expect(
      requireMobileSession(
        harness.db,
        config,
        `Bearer ${session.token}`,
        new Date(now.getTime() + MOBILE_SESSION_MS),
      ),
    ).rejects.toThrow(/Sign in/);
    await expect(
      requireMobileSession(
        harness.db,
        { ...config, secret: "rotated" },
        `Bearer ${session.token}`,
        now,
      ),
    ).rejects.toThrow(/Sign in/);
    await revokeSession(harness.db, hashMobileValue(session.token));
    await expect(
      requireMobileSession(harness.db, config, `Bearer ${session.token}`, now),
    ).rejects.toThrow(/Sign in/);
  });
  it("enforces a durable global sign-in limit", async () => {
    for (let i = 0; i < 19; i++)
      await expect(createMobileSession(harness.db, config, "wrong")).rejects.toThrow(/Incorrect/);
    const response = await call("session", "POST", { passphrase: config.passphrase }, null);
    expect(response.status).toBe(429);
  });
});
describe("canonical mobile mutations", () => {
  it("persists capture once across retry and refuses a request ID with changed intent", async () => {
    const input = { requestId: randomUUID(), text: "Synthetic mobile capture #test" };
    const first = await data<{ id: string }>(await call("capture", "POST", input));
    expect(await data(await call("capture", "POST", input))).toEqual({
      id: first.id,
      entityType: "item",
    });
    expect(await itemService.listInboxItems(harness.db)).toHaveLength(1);
    expect((await call("capture", "POST", { ...input, text: "Changed intent" })).status).toBe(409);
    const items = await data<{ items: { id: string }[] }>(await call("items"));
    expect(items.items[0]?.id).toBe(first.id);
  });
  it("rolls back the receipt on invalid capture and preserves the note capture path", async () => {
    const requestId = randomUUID();
    expect((await call("capture", "POST", { requestId, text: "x".repeat(281) })).status).toBe(400);
    await data(
      await call("capture", "POST", {
        requestId,
        text: "note: Synthetic knowledge\nA fixture only.",
      }),
    );
    expect(await noteService.listNotes(harness.db)).toHaveLength(1);
    const response = await data<{ notes: { body: string }[] }>(await call("notes?q=Synthetic"));
    expect(response.notes[0]?.body).toContain("A fixture only");
  });
  it("edits canonical items, preserves relations and prevents stale mobile overwrite", async () => {
    const id = await itemService.captureItem(harness.db, {
      text: "Synthetic item #keep",
      projectId: null,
    });
    const item = (await itemService.getItem(harness.db, id))!;
    const edit = {
      requestId: randomUUID(),
      expectedUpdatedAt: item.updatedAt.toISOString(),
      title: "Updated on iPhone",
    };
    await data(await call(`items/${id}`, "PATCH", edit));
    const updated = (await itemService.getItem(harness.db, id))!;
    expect(updated.title).toBe("Updated on iPhone");
    expect(updated.tags.map((tag) => tag.name)).toEqual(["keep"]);
    expect(
      (await call(`items/${id}`, "PATCH", { ...edit, requestId: randomUUID(), title: "stale" }))
        .status,
    ).toBe(409);
    await itemService.updateItem(harness.db, {
      ...updated,
      tags: ["keep"],
      title: "Changed on web",
    });
    const items = await data<{ items: { title: string }[] }>(await call("items"));
    expect(items.items[0]?.title).toBe("Changed on web");
  });
  it("completes one recurring occurrence and replays without advancing it again", async () => {
    const id = await itemService.captureItem(harness.db, {
      text: "Synthetic repeat every day",
      projectId: null,
    });
    const before = (await itemService.getItem(harness.db, id))!;
    expect(before.recurrence).not.toBeNull();
    const edit = {
      requestId: randomUUID(),
      expectedUpdatedAt: before.updatedAt.toISOString(),
      status: "done",
    };
    await data(await call(`items/${id}`, "PATCH", edit));
    const after = (await itemService.getItem(harness.db, id))!;
    expect(after.status).not.toBe("done");
    expect(after.dueOn).not.toBe(before.dueOn);
    expect(after.recurrence?.frequency).toBe(before.recurrence?.frequency);
    await data(await call(`items/${id}`, "PATCH", edit));
    expect((await itemService.getItem(harness.db, id))!.dueOn).toBe(after.dueOn);
  });
  it("queues a single free request, exposes runtime proposal, and accepts once through noteService", async () => {
    const request = { requestId: randomUUID(), kind: "today_briefing" };
    const job = await data<{ id: string }>(await call("requests", "POST", request));
    expect((await data<{ id: string }>(await call("requests", "POST", request))).id).toBe(job.id);
    const runtime = await registerMilesRuntime(harness.db, "synthetic-mobile-runtime");
    const claim = (await runtimeService.claimNextJob(harness.db, {
      runtimeId: runtime.id,
      role: "miles",
    }))!;
    await runtimeService.completeRun(harness.db, claim.run.id, runtime.id, {
      status: "succeeded",
      resultSummary: "Fixture completed",
      proposal: {
        kind: "create_note",
        title: "Synthetic briefing",
        body: "Synthetic proposal only.",
      },
    });
    expect(await noteService.listNotes(harness.db)).toHaveLength(0);
    const board = await data<{ jobs: { pendingApproval: { id: string; body: string } }[] }>(
      await call("jobs"),
    );
    const approval = board.jobs[0]!.pendingApproval;
    expect(approval.body).toBe("Synthetic proposal only.");
    const decision = { requestId: randomUUID(), decision: "accept" };
    await data(await call(`approvals/${approval.id}`, "POST", decision));
    await data(await call(`approvals/${approval.id}`, "POST", decision));
    expect(await noteService.listNotes(harness.db)).toHaveLength(1);
    expect(
      (
        await call(`approvals/${approval.id}`, "POST", {
          requestId: randomUUID(),
          decision: "dismiss",
        })
      ).status,
    ).toBe(409);
    expect(
      (await call("requests", "POST", { requestId: randomUUID(), kind: "today_briefing_ai" }))
        .status,
    ).toBe(400);
  });
  it("rejects malformed and oversized bodies with no data mutation", async () => {
    const response = await handleMobileRequest(
      harness.db,
      config,
      new Request("http://localhost/api/mobile/capture", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: "x".repeat(48001),
      }),
      ["capture"],
    );
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await itemService.listInboxItems(harness.db)).toHaveLength(0);
  });
});
