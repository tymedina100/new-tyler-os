import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { approvals, jobs, notes, runs } from "@/server/db/schema";
import * as service from "@/server/runtime/runtime-service";
import { getOperationsSummary } from "@/server/runtime/operations-service";
import { registerMilesRuntime } from "../support/runtime-fixtures";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

let harness: TestDatabase;
const now = new Date("2026-09-09T19:00:00Z");
const before = new Date("2026-09-09T18:00:00Z");
beforeAll(async () => {
  harness = await createTestDatabase();
});
beforeEach(async () => {
  await harness.truncate();
});
afterAll(async () => {
  await harness.close();
});

async function finish(status: "succeeded" | "failed", proposal = false, at = before) {
  const runtime = await registerMilesRuntime(harness.db, `worker-${crypto.randomUUID()}`);
  await service.enqueueTodayBriefing(harness.db);
  const claim = await service.claimNextJob(
    harness.db,
    { runtimeId: runtime.id, role: "miles" },
    at,
  );
  if (!claim) throw new Error("No claim");
  await service.completeRun(
    harness.db,
    claim.run.id,
    runtime.id,
    {
      status,
      resultSummary: "PRIVATE runtime prose must not appear in summary",
      ...(proposal
        ? {
            proposal: {
              kind: "create_note" as const,
              title: "Private title",
              body: "Private body",
            },
          }
        : {}),
      usage: { provider: "none", model: "deterministic" },
    },
    at,
  );
  // Creation timestamps come from the database wall clock, pin them for this fixture.
  await harness.db
    .update(approvals)
    .set({ createdAt: at })
    .where(eq(approvals.jobId, claim.job.id));
  return claim;
}

it("counts pending decisions of any age and only persisted accepted notes as saved", async () => {
  await finish("succeeded", true, new Date("2026-09-01T12:00:00Z"));
  expect((await getOperationsSummary(harness.db, now)).pendingApprovals).toBe(1);
  expect((await getOperationsSummary(harness.db, now)).savedNotes).toBe(0);
  const [approval] = await harness.db.select().from(approvals);
  if (!approval) throw new Error("Missing approval");
  await service.acceptApproval(harness.db, approval.id, before);
  const summary = await getOperationsSummary(harness.db, now);
  expect(summary).toMatchObject({ pendingApprovals: 0, savedNotes: 1, failedJobs: 0 });
  expect(JSON.stringify(summary)).not.toContain("Private");
  const [note] = await harness.db.select().from(notes);
  if (!note) throw new Error("Missing note");
  await harness.db.delete(notes).where(eq(notes.id, note.id));
  expect((await getOperationsSummary(harness.db, now)).savedNotes).toBe(0);
});

it("counts failed jobs once and excludes outcomes outside the rolling window", async () => {
  const recent = await finish("failed");
  await finish("failed", false, new Date("2026-09-08T18:59:59Z"));
  await finish("failed", false, now);
  await harness.db.insert(runs).values({
    jobId: recent.job.id,
    runtimeId: recent.run.runtimeId,
    role: "miles",
    status: "failed",
    trigger: "manual",
    startedAt: before,
    finishedAt: before,
  });
  expect((await getOperationsSummary(harness.db, now)).failedJobs).toBe(1);
  expect((await service.getTodayContext(harness.db, now)).operations?.failedJobs).toBe(1);
});

it("does not count dismissed or quiet runs as completed actions", async () => {
  await finish("succeeded");
  await finish("succeeded", true);
  const [approval] = await harness.db.select().from(approvals);
  if (!approval) throw new Error("Missing approval");
  await service.dismissApproval(harness.db, approval.id, before);
  expect(await getOperationsSummary(harness.db, now)).toMatchObject({
    savedNotes: 0,
    pendingApprovals: 0,
    failedJobs: 0,
  });
});

it("keeps older pending decisions reachable beyond the recent 50 jobs", async () => {
  const pending = await finish("succeeded", true);
  await harness.db
    .update(jobs)
    .set({ createdAt: new Date("2026-09-01T12:00:00Z") })
    .where(eq(jobs.id, pending.job.id));
  await harness.db.insert(jobs).values(
    Array.from({ length: 55 }, () => ({
      kind: "today_briefing" as const,
      title: "Newer synthetic job",
      instruction: "Fixture",
      authorization: "observe" as const,
      assignedRole: "miles" as const,
    })),
  );
  const board = await service.listRuntimeBoard(harness.db);
  expect(board).toHaveLength(51);
  expect(board.find((row) => row.job.id === pending.job.id)?.pendingApproval).not.toBeNull();
  expect(board.find((row) => row.job.id === pending.job.id)?.pendingApproval?.status).toBe(
    "pending",
  );
});
