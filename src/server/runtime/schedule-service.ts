import { TODAY_BRIEFING_INSTRUCTION, TODAY_BRIEFING_TITLE } from "@/domain/runtime/runtime";
import { recoverStaleObserveAttempt } from "@/domain/runtime/recovery-rules";
import { evaluateSchedule } from "@/domain/runtime/schedule-rules";
import type { Database } from "@/server/db/client";
import * as runtimeRepo from "./runtime-repository";
import * as scheduleRepo from "./schedule-repository";

/**
 * Deterministic scheduler tick.
 *
 * Recovers stale observe attempts, then idempotently enqueues due jobs.
 * Makes no model calls. The worker that POSTs this is a clock, not Miles.
 */

export interface TickResult {
  recovered: number;
  failedAfterAttempts: number;
  enqueued: number;
}

export async function tickSchedules(db: Database, now = new Date()): Promise<TickResult> {
  return db.transaction(async (tx) => {
    const recovered = await recoverStaleObserveRuns(tx, now);
    const enqueued = await enqueueDueSchedules(tx, now);
    return { ...recovered, enqueued };
  });
}

async function recoverStaleObserveRuns(
  db: Database,
  now: Date,
): Promise<{ recovered: number; failedAfterAttempts: number }> {
  const attempts = await runtimeRepo.listRunningObserveAttempts(db);
  let recovered = 0;
  let failedAfterAttempts = 0;

  for (const { job, run } of attempts) {
    const decision = recoverStaleObserveAttempt(job, run, now);
    if (!decision.applicable) continue;

    await runtimeRepo.updateRun(db, run.id, decision.run);
    await runtimeRepo.updateJob(db, job.id, decision.job);
    recovered += 1;
    if (decision.job.status === "failed") failedAfterAttempts += 1;
  }

  return { recovered, failedAfterAttempts };
}

async function enqueueDueSchedules(db: Database, now: Date): Promise<number> {
  const rows = await scheduleRepo.listEnabledSchedules(db);
  let enqueued = 0;

  for (const schedule of rows) {
    const verdict = evaluateSchedule(schedule, now);
    if (!verdict.due) continue;

    const existing = await runtimeRepo.findJobByScheduleDate(
      db,
      schedule.id,
      verdict.scheduledForDate,
    );
    if (existing) continue;

    await runtimeRepo.insertJob(db, {
      kind: schedule.jobKind,
      title: TODAY_BRIEFING_TITLE,
      instruction: TODAY_BRIEFING_INSTRUCTION,
      authorization: schedule.authorization,
      assignedRole: schedule.assignedRole,
      requestedRuntimeKind: schedule.requestedRuntimeKind ?? undefined,
      scheduleId: schedule.id,
      scheduledForDate: verdict.scheduledForDate,
    });
    enqueued += 1;
  }

  return enqueued;
}
