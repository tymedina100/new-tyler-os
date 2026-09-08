import { DomainError, NotFoundError } from "@/domain/shared/errors";
import { assertRoleGranted } from "@/domain/runtime/fleet-rules";
import {
  CHIEF_OF_STAFF_ROLE,
  TODAY_BRIEFING_INSTRUCTION,
  TODAY_BRIEFING_TITLE,
  type Job,
  type Role,
  type Run,
  type Runtime,
} from "@/domain/runtime/runtime";
import {
  assertRuntimeEnabled,
  claimQueuedJob,
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
import * as fleetRepo from "./fleet-repository";
import { assertRunOwnedBy, requireJob, requireRun, requireRuntime } from "./runtime-lookups";
import * as repo from "./runtime-repository";
import { projectTodayContext } from "./today-context";

export { completeRun, completeValidatedAiRun } from "./complete-run";

/**
 * Runtime use cases.
 *
 * Orchestrates: load state, ask the domain, write the patch. Completing a
 * run writes a note only when standing authority matches, and then only
 * through `noteService.captureNote` — the same path as Tyler accepting.
 * Otherwise the proposal waits. Identity is an instance, not a kind singleton.
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
  identity: { runtimeId: string; role: Role },
  now = new Date(),
): Promise<{ job: Job; run: Run } | null> {
  return db.transaction(async (tx) => {
    const runtime = await requireRuntime(tx, identity.runtimeId);
    assertRuntimeEnabled(runtime.status);
    const grants = await fleetRepo.listRoleGrants(tx, runtime.id);
    assertRoleGranted(grants, identity.role);

    const job = await repo.lockNextQueuedJob(tx, identity.role, runtime.kind);
    if (job === null) return null;

    const patch = claimQueuedJob(
      job,
      {
        runtimeId: runtime.id,
        runtimeKind: runtime.kind,
        role: identity.role,
      },
      now,
    );

    const claimed = await repo.updateJob(tx, job.id, patch);
    if (claimed === null) throw new NotFoundError("Job", job.id);

    await repo.touchRuntimeLastSeen(tx, runtime.id, now);

    const run = await repo.insertRun(tx, {
      jobId: claimed.id,
      runtimeId: runtime.id,
      role: identity.role,
      trigger: claimed.scheduleId ? "schedule" : "manual",
      startedAt: now,
    });

    return { job: claimed, run };
  });
}

export async function heartbeatRun(
  db: Database,
  runId: string,
  runtimeId: string,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const runtime = await requireRuntime(tx, runtimeId);
    const run = await requireRun(tx, runId);
    assertRunOwnedBy(run, runtime.id);
    const patch = heartbeatRunningRun(run, now);
    await repo.updateRun(tx, run.id, patch);
    await repo.touchRuntimeLastSeen(tx, runtime.id, now);
  });
}

export async function getTodayContext(db: Database, now = new Date()): Promise<TodayContext> {
  const [{ today, view }, expiring] = await Promise.all([
    getTodayData(db, now),
    getExpiringSoon(db, now),
  ]);

  return projectTodayContext(today, view, expiring.items);
}

export async function markRuntimeSeen(
  db: Database,
  runtime: Runtime,
  now = new Date(),
): Promise<void> {
  await repo.touchRuntimeLastSeen(db, runtime.id, now);
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
