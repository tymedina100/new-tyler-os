import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as itemService from "@/server/items/item-service";
import * as noteService from "@/server/notes/note-service";
import * as runtimeService from "@/server/runtime/runtime-service";
import { insertJob } from "@/server/runtime/runtime-repository";
import { runtimes } from "@/server/db/schema";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

let harness: TestDatabase;

beforeAll(async () => {
  harness = await createTestDatabase();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

function db() {
  return harness.db;
}

describe("enqueue and claim", () => {
  it("lets a Python runtime acting as Miles claim a Miles briefing", async () => {
    const job = await runtimeService.enqueueTodayBriefing(db());
    expect(job.assignedRole).toBe("miles");
    expect(job.authorization).toBe("observe");
    expect(job.requestedRuntimeKind).toBeNull();

    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeKind: "python",
      role: "miles",
    });

    expect(claimed?.job.id).toBe(job.id);
    expect(claimed?.job.status).toBe("running");
    expect(claimed?.run.role).toBe("miles");
  });

  it("lets a Grok runtime claim the same unpinned Miles job", async () => {
    await runtimeService.enqueueTodayBriefing(db());
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeKind: "grok_bot",
      role: "miles",
    });
    expect(claimed?.run.role).toBe("miles");
  });

  it("does not let Scout claim a Miles job", async () => {
    const job = await runtimeService.enqueueTodayBriefing(db());
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeKind: "python",
      role: "scout",
    });

    expect(claimed).toBeNull();
    const stillQueued = await runtimeService.claimNextJob(db(), {
      runtimeKind: "python",
      role: "miles",
    });
    expect(stillQueued?.job.id).toBe(job.id);
  });

  it("does not let Python claim a job pinned to grok_bot", async () => {
    await insertJob(db(), {
      kind: "today_briefing",
      title: "Pinned briefing",
      instruction: "Use Grok.",
      authorization: "observe",
      assignedRole: "miles",
      requestedRuntimeKind: "grok_bot",
    });

    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeKind: "python",
      role: "miles",
    });
    expect(claimed).toBeNull();
  });

  it("gives a queued job to only one of two concurrent claimants", async () => {
    await runtimeService.enqueueTodayBriefing(db());

    const [first, second] = await Promise.all([
      runtimeService.claimNextJob(db(), { runtimeKind: "python", role: "miles" }),
      runtimeService.claimNextJob(db(), { runtimeKind: "grok_bot", role: "miles" }),
    ]);

    const wins = [first, second].filter((value) => value !== null);
    expect(wins).toHaveLength(1);
  });
});

describe("complete, accept and dismiss", () => {
  it("does not create a note when a run completes with a proposal", async () => {
    await runtimeService.enqueueTodayBriefing(db());
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeKind: "python",
      role: "miles",
    });
    if (!claimed) throw new Error("expected a claim");

    await runtimeService.completeRun(db(), claimed.run.id, "python", {
      status: "succeeded",
      resultSummary: "Drafted today's briefing.",
      proposal: {
        kind: "create_note",
        title: "Today briefing — 4 Sep 2026",
        body: "## Overdue\n- Pay rent",
      },
      usage: {
        provider: "none",
        model: "deterministic",
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
      },
    });

    expect(await noteService.listNotes(db())).toHaveLength(0);

    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("needs_approval");
    expect(row?.pendingApproval?.title).toBe("Today briefing — 4 Sep 2026");
    expect(row?.latestRun?.model).toBe("deterministic");
  });

  it("creates a note only when the proposal is accepted", async () => {
    const approvalId = await enqueueAndPropose();
    await runtimeService.acceptApproval(db(), approvalId);

    const notes = await noteService.listNotes(db());
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe("Today briefing — 4 Sep 2026");
    expect(notes[0]?.body).toContain("Pay rent");

    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("succeeded");
    expect(row?.pendingApproval).toBeNull();
  });

  it("creates no note when the proposal is dismissed", async () => {
    const approvalId = await enqueueAndPropose();
    await runtimeService.dismissApproval(db(), approvalId);

    expect(await noteService.listNotes(db())).toHaveLength(0);
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("succeeded");
  });

  it("creates exactly one note when two accepts race", async () => {
    const approvalId = await enqueueAndPropose();

    const results = await Promise.allSettled([
      runtimeService.acceptApproval(db(), approvalId),
      runtimeService.acceptApproval(db(), approvalId),
    ]);

    const succeeded = results.filter((result) => result.status === "fulfilled");
    const failed = results.filter((result) => result.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "This proposal has already been resolved." }),
    });
    expect(await noteService.listNotes(db())).toHaveLength(1);
  });

  it("resolves exactly once when accept and dismiss race", async () => {
    const approvalId = await enqueueAndPropose();

    const results = await Promise.allSettled([
      runtimeService.acceptApproval(db(), approvalId),
      runtimeService.dismissApproval(db(), approvalId),
    ]);

    const succeeded = results.filter((result) => result.status === "fulfilled");
    const failed = results.filter((result) => result.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "This proposal has already been resolved." }),
    });

    const notes = await noteService.listNotes(db());
    expect(notes.length).toBeLessThanOrEqual(1);
    if (results[0]?.status === "fulfilled") {
      expect(notes).toHaveLength(1);
    } else {
      expect(notes).toHaveLength(0);
    }

    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("succeeded");
    expect(row?.pendingApproval).toBeNull();
  });
});

describe("today context", () => {
  it("exposes titles and dates, not item bodies", async () => {
    const overdue = await itemService.captureItem(db(), {
      text: "Pay rent",
      projectId: null,
    });
    await itemService.updateItem(db(), {
      id: overdue,
      title: "Pay rent",
      body: "secret lease clause",
      kind: "task",
      status: "active",
      dueOn: "2026-09-01",
      tags: [],
      projectId: null,
      recurrence: null,
    });

    const context = await runtimeService.getTodayContext(
      db(),
      new Date("2026-09-04T12:00:00.000Z"),
    );

    const serialized = JSON.stringify(context);
    expect(serialized).toContain("Pay rent");
    expect(serialized).not.toContain("secret lease clause");
    expect(context.overdue[0]?.dueOn).toBe("2026-09-01");
  });
});

describe("disabled runtimes", () => {
  it("refuses to claim when that runtime kind is disabled", async () => {
    await db().insert(runtimes).values({
      name: "Python worker",
      kind: "python",
      status: "disabled",
    });
    await runtimeService.enqueueTodayBriefing(db());

    await expect(
      runtimeService.claimNextJob(db(), { runtimeKind: "python", role: "miles" }),
    ).rejects.toThrow(/disabled/);
  });
});

async function enqueueAndPropose(): Promise<string> {
  await runtimeService.enqueueTodayBriefing(db());
  const claimed = await runtimeService.claimNextJob(db(), {
    runtimeKind: "python",
    role: "miles",
  });
  if (!claimed) throw new Error("expected a claim");

  await runtimeService.completeRun(db(), claimed.run.id, "python", {
    status: "succeeded",
    resultSummary: "Drafted today's briefing.",
    proposal: {
      kind: "create_note",
      title: "Today briefing — 4 Sep 2026",
      body: "## Overdue\n- Pay rent",
    },
  });

  const [row] = await runtimeService.listRuntimeBoard(db());
  const approvalId = row?.pendingApproval?.id;
  if (!approvalId) throw new Error("expected a pending approval");
  return approvalId;
}
