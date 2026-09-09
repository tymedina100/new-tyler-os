import { and, count, countDistinct, eq, gte, inArray, lt } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { approvals, jobs, notes, runs } from "@/server/db/schema";

/** Aggregate in SQL: old pending decisions must not disappear behind a recent-job limit. */
export async function readOperationCounts(db: Database, since: Date, now: Date) {
  const [[pending], [failed], [saved]] = await Promise.all([
    db
      .select({ value: count() })
      .from(approvals)
      .innerJoin(jobs, eq(jobs.id, approvals.jobId))
      .where(
        and(
          eq(approvals.status, "pending"),
          eq(jobs.status, "needs_approval"),
          lt(approvals.createdAt, now),
        ),
      ),
    db
      .select({ value: countDistinct(jobs.id) })
      .from(jobs)
      .innerJoin(runs, eq(runs.jobId, jobs.id))
      .where(
        and(
          eq(jobs.status, "failed"),
          eq(runs.status, "failed"),
          gte(runs.finishedAt, since),
          lt(runs.finishedAt, now),
        ),
      ),
    db
      .select({ value: countDistinct(notes.id) })
      .from(approvals)
      .innerJoin(notes, eq(notes.id, approvals.acceptedNoteId))
      .where(
        and(
          inArray(approvals.status, ["accepted", "auto_executed"]),
          gte(approvals.resolvedAt, since),
          lt(approvals.resolvedAt, now),
        ),
      ),
  ]);
  return {
    pendingApprovals: pending?.value ?? 0,
    failedJobs: failed?.value ?? 0,
    savedNotes: saved?.value ?? 0,
  };
}
