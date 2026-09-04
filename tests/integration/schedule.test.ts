import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  MILES_WEEKDAY_MORNING_BRIEFING_KEY,
  OBSERVE_RUN_LEASE_MS,
} from "@/domain/runtime/schedule";
import * as itemService from "@/server/items/item-service";
import * as noteService from "@/server/notes/note-service";
import { insertJob } from "@/server/runtime/runtime-repository";
import * as runtimeService from "@/server/runtime/runtime-service";
import { findScheduleByKey } from "@/server/runtime/schedule-repository";
import { tickSchedules } from "@/server/runtime/schedule-service";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

const MONDAY_BEFORE = new Date("2026-09-07T13:19:00.000Z");
const MONDAY_DUE = new Date("2026-09-07T13:20:00.000Z");
const MONDAY_CATCH_UP = new Date("2026-09-07T18:43:00.000Z");
const MONDAY_NOON = new Date("2026-09-07T19:00:00.000Z");
const SATURDAY = new Date("2026-09-05T13:20:00.000Z");
const STALE_NOW = new Date(MONDAY_DUE.getTime() + OBSERVE_RUN_LEASE_MS + 1_000);

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

describe("weekday morning schedule", () => {
  it("seeds Miles briefing unpinned to any runtime", async () => {
    const schedule = await findScheduleByKey(db(), MILES_WEEKDAY_MORNING_BRIEFING_KEY);
    expect(schedule).toMatchObject({
      assignedRole: "miles",
      jobKind: "today_briefing",
      authorization: "observe",
      requestedRuntimeKind: null,
      timezone: "America/Phoenix",
      weekdaysOnly: true,
    });
  });

  it("does not enqueue before 06:20 Phoenix", async () => {
    const result = await tickSchedules(db(), MONDAY_BEFORE);
    expect(result.enqueued).toBe(0);
    expect(await runtimeService.listRuntimeBoard(db())).toHaveLength(0);
  });

  it("enqueues one Miles job at 06:20 and keeps it unpinned", async () => {
    const result = await tickSchedules(db(), MONDAY_DUE);
    expect(result.enqueued).toBe(1);

    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.assignedRole).toBe("miles");
    expect(row?.job.requestedRuntimeKind).toBeNull();
    expect(row?.job.scheduleId).toBeTruthy();
    expect(row?.job.scheduledForDate).toBe("2026-09-07");
  });

  it("does not duplicate on repeated ticks", async () => {
    await tickSchedules(db(), MONDAY_DUE);
    await tickSchedules(db(), MONDAY_DUE);
    await tickSchedules(db(), MONDAY_CATCH_UP);
    expect(await runtimeService.listRuntimeBoard(db())).toHaveLength(1);
  });

  it("does not duplicate on concurrent ticks", async () => {
    await Promise.all([
      tickSchedules(db(), MONDAY_DUE),
      tickSchedules(db(), MONDAY_DUE),
      tickSchedules(db(), MONDAY_DUE),
    ]);
    expect(await runtimeService.listRuntimeBoard(db())).toHaveLength(1);
  });

  it("skips the weekend", async () => {
    await tickSchedules(db(), SATURDAY);
    expect(await runtimeService.listRuntimeBoard(db())).toHaveLength(0);
  });

  it("catches up at 7–11 AM Phoenix", async () => {
    await tickSchedules(db(), MONDAY_CATCH_UP);
    expect(await runtimeService.listRuntimeBoard(db())).toHaveLength(1);
  });

  it("does not enqueue a missed briefing after noon", async () => {
    await tickSchedules(db(), MONDAY_NOON);
    expect(await runtimeService.listRuntimeBoard(db())).toHaveLength(0);
  });

  it("lets a manual briefing coexist with a scheduled one", async () => {
    await tickSchedules(db(), MONDAY_DUE);
    await runtimeService.enqueueTodayBriefing(db());
    const rows = await runtimeService.listRuntimeBoard(db());
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.job.scheduleId !== null)).toHaveLength(1);
    expect(rows.filter((row) => row.job.scheduleId === null)).toHaveLength(1);
  });

  it("records trigger=schedule on the scheduled run", async () => {
    await tickSchedules(db(), MONDAY_DUE);
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeKind: "python",
      role: "miles",
    });
    expect(claimed?.run.trigger).toBe("schedule");
    expect(claimed?.run.role).toBe("miles");
  });
});

describe("empty vs material Today", () => {
  it("completes with no approval or note when Today is empty", async () => {
    await runtimeService.enqueueTodayBriefing(db());
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeKind: "python",
      role: "miles",
    });
    if (!claimed) throw new Error("expected a claim");

    await runtimeService.completeRun(db(), claimed.run.id, "python", {
      status: "succeeded",
      resultSummary: "No material Today items.",
      usage: { provider: "none", model: "deterministic" },
    });

    expect(await noteService.listNotes(db())).toHaveLength(0);
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("succeeded");
    expect(row?.pendingApproval).toBeNull();
  });

  it("still proposes a note when Today has work", async () => {
    await itemService.captureItem(db(), { text: "Pay rent", projectId: null });
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
        title: "Today briefing — 7 Sep 2026",
        body: "## Needs triage\n- Pay rent",
      },
    });

    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.pendingApproval?.title).toBe("Today briefing — 7 Sep 2026");
  });
});

describe("stale observe recovery", () => {
  it("requeues a stale observe run so another runtime can claim it", async () => {
    await tickSchedules(db(), MONDAY_DUE);
    const first = await runtimeService.claimNextJob(db(), {
      runtimeKind: "python",
      role: "miles",
    });
    if (!first) throw new Error("expected a claim");

    const tick = await tickSchedules(db(), STALE_NOW);
    expect(tick.recovered).toBe(1);

    const second = await runtimeService.claimNextJob(db(), {
      runtimeKind: "grok_bot",
      role: "miles",
    });
    expect(second?.run.runtimeId).not.toBe(first.run.runtimeId);
    expect(second?.job.id).toBe(first.job.id);
    expect(second?.job.attemptCount).toBe(2);

    await expect(
      runtimeService.completeRun(db(), first.run.id, "python", {
        status: "succeeded",
        resultSummary: "too late",
        proposal: { kind: "create_note", title: "Late", body: "nope" },
      }),
    ).rejects.toThrow(/no longer the current claim/);
  });

  it("stops after three observe attempts", async () => {
    await tickSchedules(db(), MONDAY_DUE);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const claimed = await runtimeService.claimNextJob(db(), {
        runtimeKind: "python",
        role: "miles",
      });
      if (!claimed) throw new Error("expected a claim");
      await tickSchedules(db(), new Date(STALE_NOW.getTime() + attempt * 60_000));
    }

    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("failed");
    expect(row?.job.attemptCount).toBe(3);

    const again = await runtimeService.claimNextJob(db(), {
      runtimeKind: "python",
      role: "miles",
    });
    expect(again).toBeNull();
  });

  it("does not auto-retry non-observe work", async () => {
    await insertJob(db(), {
      kind: "today_briefing",
      title: "Propose only",
      instruction: "Do not auto-retry.",
      authorization: "propose",
      assignedRole: "miles",
    });
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeKind: "python",
      role: "miles",
    });
    if (!claimed) throw new Error("expected a claim");

    const tick = await tickSchedules(db(), MONDAY_NOON);
    expect(tick.recovered).toBe(0);
    expect(tick.enqueued).toBe(0);
    const rows = await runtimeService.listRuntimeBoard(db());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.job.status).toBe("running");
    expect(rows[0]?.job.authorization).toBe("propose");
  });
});
