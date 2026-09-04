import { DomainError, NotFoundError } from "@/domain/shared/errors";
import {
  CHIEF_OF_STAFF_ROLE,
  TODAY_BRIEFING_INSTRUCTION,
  TODAY_BRIEFING_TITLE,
  type Job,
  type Role,
  type Run,
  type RuntimeKind,
} from "@/domain/runtime/runtime";
import type { CompleteRunInput } from "@/domain/runtime/runtime-schema";
import {
  assertRuntimeEnabled,
  claimQueuedJob,
  completeRunningJob,
  emptyUsage,
  finishRun,
  heartbeatRunningRun,
  proposedNoteCaptureBody,
  resolveApproval,
  settleApprovedJob,
} from "@/domain/runtime/runtime-rules";
import type { TodayContext } from "@/domain/runtime/today-context";
import type { Database } from "@/server/db/client";
import { getTodayData } from "@/server/items/item-service";
import { getExpiringSoon } from "@/server/kitchen/inventory-service";
import { captureNote } from "@/server/notes/note-service";
import * as repo from "./runtime-repository";
import { projectTodayContext } from "./today-context";

/**
 * Runtime use cases.
 *
 * Orchestrates: load state, ask the domain, write the patch. Completing a
 * run never writes a note — that happens only when Tyler accepts, through
 * the ordinary note service.
 */

export async function enqueueTodayBriefing(db: Database): Promise<Job> {
  return repo.insertJob(db, {
    kind: "today_briefing",
    title: TODAY_BRIEFING_TITLE,
    instruction: TODAY_BRIEFING_INSTRUCTION,
    authorization: "observe",
    assignedRole: CHIEF_OF_STAFF_ROLE,
  });
}

export async function claimNextJob(
  db: Database,
  identity: { runtimeKind: RuntimeKind; role: Role },
  now = new Date(),
): Promise<{ job: Job; run: Run } | null> {
  return db.transaction(async (tx) => {
    const runtime = await repo.upsertRuntimeByKind(tx, identity.runtimeKind, now);
    assertRuntimeEnabled(runtime.status);

    const job = await repo.lockNextQueuedJob(tx, identity.role, identity.runtimeKind);
    if (job === null) return null;

    const patch = claimQueuedJob(
      job,
      {
        runtimeId: runtime.id,
        runtimeKind: identity.runtimeKind,
        role: identity.role,
      },
      now,
    );

    const claimed = await repo.updateJob(tx, job.id, patch);
    if (claimed === null) throw new NotFoundError("Job", job.id);

    const run = await repo.insertRun(tx, {
      jobId: claimed.id,
      runtimeId: runtime.id,
      role: identity.role,
      trigger: "manual",
      startedAt: now,
    });

    return { job: claimed, run };
  });
}

export async function heartbeatRun(
  db: Database,
  runId: string,
  runtimeKind: RuntimeKind,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const runtime = await repo.upsertRuntimeByKind(tx, runtimeKind, now);
    const run = await requireRun(tx, runId);
    assertRunOwnedBy(run, runtime.id);
    const patch = heartbeatRunningRun(run, now);
    await repo.updateRun(tx, run.id, patch);
  });
}

export async function completeRun(
  db: Database,
  runId: string,
  runtimeKind: RuntimeKind,
  input: CompleteRunInput,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const runtime = await repo.upsertRuntimeByKind(tx, runtimeKind, now);
    const run = await requireRun(tx, runId);
    assertRunOwnedBy(run, runtime.id);
    const job = await requireJob(tx, run.jobId);

    const outcome = input.status;
    const usage = input.usage ?? emptyUsage();
    const jobPatch = completeRunningJob(job, run, outcome, input.proposal !== undefined);
    const runPatch = finishRun(run, outcome, now, input.resultSummary, usage);

    await repo.updateRun(tx, run.id, runPatch);
    await repo.updateJob(tx, job.id, { status: jobPatch.jobStatus });

    if (outcome === "succeeded" && input.proposal) {
      await repo.insertApproval(tx, {
        runId: run.id,
        jobId: job.id,
        kind: input.proposal.kind,
        title: input.proposal.title,
        body: input.proposal.body,
      });
    }
  });
}

export async function getTodayContext(db: Database, now = new Date()): Promise<TodayContext> {
  const [{ today, view }, expiring] = await Promise.all([
    getTodayData(db, now),
    getExpiringSoon(db, now),
  ]);

  return projectTodayContext(today, view, expiring.items);
}

export async function listRuntimeBoard(db: Database) {
  return repo.listRecentJobs(db);
}

export async function acceptApproval(db: Database, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const approval = await ownPendingApproval(tx, id, "accepted", now);
    const body = proposedNoteCaptureBody(approval.title, approval.body);
    const noteId = await captureNote(tx, { body, projectId: null });
    await repo.updateApproval(tx, approval.id, { acceptedNoteId: noteId });
    const job = await requireJob(tx, approval.jobId);
    const settled = settleApprovedJob(job);
    await repo.updateJob(tx, job.id, settled);
  });
}

export async function dismissApproval(db: Database, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const approval = await ownPendingApproval(tx, id, "dismissed", now);
    const job = await requireJob(tx, approval.jobId);
    const settled = settleApprovedJob(job);
    await repo.updateJob(tx, job.id, settled);
  });
}

async function requireRun(db: Database, id: string): Promise<Run> {
  const run = await repo.findRunById(db, id);
  if (run === null) throw new NotFoundError("Run", id);
  return run;
}

async function requireJob(db: Database, id: string): Promise<Job> {
  const job = await repo.findJobById(db, id);
  if (job === null) throw new NotFoundError("Job", id);
  return job;
}

async function ownPendingApproval(
  db: Database,
  id: string,
  decision: "accepted" | "dismissed",
  now: Date,
) {
  const approval = await repo.findApprovalById(db, id);
  if (approval === null) throw new NotFoundError("Approval", id);

  const patch = resolveApproval(approval, decision, now);
  const owned = await repo.takePendingApproval(db, id, patch);
  if (owned === null) {
    throw new DomainError("invalid_transition", "This proposal has already been resolved.");
  }

  return owned;
}

function assertRunOwnedBy(run: Run, runtimeId: string): void {
  if (run.runtimeId !== runtimeId) {
    throw new DomainError("invalid_transition", "This attempt belongs to a different runtime.");
  }
}
