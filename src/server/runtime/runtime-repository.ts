import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Approval, Job, Run, Runtime, RuntimeKind, Role } from "@/domain/runtime/runtime";
import type { Database } from "@/server/db/client";
import { approvals, jobs, runtimes, runs } from "@/server/db/schema";
import { toApproval, toJob, toRun, toRuntime } from "./runtime-rows";

/**
 * Data access for the runtime control plane.
 *
 * Speaks SQL and returns domain shapes. Claim locking lives here because
 * `FOR UPDATE SKIP LOCKED` is the rule that two pollers cannot take the
 * same job; the domain still decides whether the locked row may be claimed.
 */

export async function findRuntimeById(db: Database, id: string): Promise<Runtime | null> {
  const [row] = await db.select().from(runtimes).where(eq(runtimes.id, id)).limit(1);
  return row ? toRuntime(row) : null;
}

export async function findRuntimeByInstanceKey(
  db: Database,
  instanceKey: string,
): Promise<Runtime | null> {
  const [row] = await db
    .select()
    .from(runtimes)
    .where(eq(runtimes.instanceKey, instanceKey))
    .limit(1);
  return row ? toRuntime(row) : null;
}

export async function listRuntimes(db: Database): Promise<Runtime[]> {
  const rows = await db.select().from(runtimes).orderBy(runtimes.createdAt);
  return rows.map(toRuntime);
}

export async function touchRuntimeLastSeen(db: Database, id: string, now: Date): Promise<void> {
  await db.update(runtimes).set({ lastSeenAt: now }).where(eq(runtimes.id, id));
}

export async function insertJob(
  db: Database,
  values: {
    kind: Job["kind"];
    title: string;
    instruction: string;
    authorization: Job["authorization"];
    assignedRole: Role;
    requestedRuntimeKind?: Job["requestedRuntimeKind"];
    aiExecutionProfileId?: Job["aiExecutionProfileId"];
    scheduleId?: string | null;
    scheduledForDate?: Job["scheduledForDate"];
  },
): Promise<Job> {
  const [row] = await db
    .insert(jobs)
    .values({
      kind: values.kind,
      title: values.title,
      instruction: values.instruction,
      authorization: values.authorization,
      assignedRole: values.assignedRole,
      requestedRuntimeKind: values.requestedRuntimeKind ?? null,
      aiExecutionProfileId: values.aiExecutionProfileId ?? null,
      scheduleId: values.scheduleId ?? null,
      scheduledForDate: values.scheduledForDate ?? null,
    })
    .onConflictDoNothing({ target: [jobs.scheduleId, jobs.scheduledForDate] })
    .returning();

  if (row) return toJob(row);

  if (values.scheduleId && values.scheduledForDate) {
    const existing = await findJobByScheduleDate(db, values.scheduleId, values.scheduledForDate);
    if (existing) return existing;
  }

  throw new Error("Insert returned no job.");
}

export async function findJobByScheduleDate(
  db: Database,
  scheduleId: string,
  scheduledForDate: string,
): Promise<Job | null> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.scheduleId, scheduleId), eq(jobs.scheduledForDate, scheduledForDate)))
    .limit(1);
  return row ? toJob(row) : null;
}

export async function lockNextQueuedJob(
  db: Database,
  role: Role,
  runtimeKind: RuntimeKind,
  allowedJobKinds?: Job["kind"][],
): Promise<Job | null> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "queued"),
        allowedJobKinds === undefined ? undefined : inArray(jobs.kind, allowedJobKinds),
        eq(jobs.assignedRole, role),
        or(isNull(jobs.requestedRuntimeKind), eq(jobs.requestedRuntimeKind, runtimeKind)),
      ),
    )
    .orderBy(jobs.createdAt)
    .limit(1)
    .for("update", { skipLocked: true });

  return row ? toJob(row) : null;
}

export async function updateJob(
  db: Database,
  id: string,
  patch: Partial<Pick<Job, "status" | "claimedByRuntimeId" | "claimedAt" | "attemptCount">>,
): Promise<Job | null> {
  const [row] = await db.update(jobs).set(patch).where(eq(jobs.id, id)).returning();
  return row ? toJob(row) : null;
}

export async function insertRun(
  db: Database,
  values: {
    jobId: string;
    runtimeId: string;
    role: Role;
    trigger: Run["trigger"];
    startedAt: Date;
  },
): Promise<Run> {
  const [row] = await db
    .insert(runs)
    .values({
      jobId: values.jobId,
      runtimeId: values.runtimeId,
      role: values.role,
      trigger: values.trigger,
      startedAt: values.startedAt,
    })
    .returning();

  if (!row) throw new Error("Insert returned no run.");
  return toRun(row);
}

export async function findRunById(db: Database, id: string): Promise<Run | null> {
  const [row] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  return row ? toRun(row) : null;
}

/**
 * Exactly one /brief may start an AI request for a run. The UPDATE is the
 * lock; the caller must not hold a transaction across the provider call.
 */
export async function claimAiRequest(
  db: Database,
  runId: string,
  runtimeId: string,
  now: Date,
): Promise<Run | null> {
  const [row] = await db
    .update(runs)
    .set({ aiRequestStartedAt: now })
    .where(
      and(
        eq(runs.id, runId),
        eq(runs.runtimeId, runtimeId),
        eq(runs.status, "running"),
        isNull(runs.aiRequestStartedAt),
      ),
    )
    .returning();

  return row ? toRun(row) : null;
}

export async function findJobById(db: Database, id: string): Promise<Job | null> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return row ? toJob(row) : null;
}

export async function updateRun(
  db: Database,
  id: string,
  patch: Partial<
    Pick<
      Run,
      | "status"
      | "resultSummary"
      | "lastHeartbeatAt"
      | "finishedAt"
      | "provider"
      | "model"
      | "inputTokens"
      | "cachedInputTokens"
      | "outputTokens"
      | "estimatedCostUsd"
    >
  >,
): Promise<Run | null> {
  const [row] = await db.update(runs).set(patch).where(eq(runs.id, id)).returning();
  return row ? toRun(row) : null;
}

type RunFinishPersist = Partial<
  Pick<
    Run,
    | "status"
    | "resultSummary"
    | "finishedAt"
    | "provider"
    | "model"
    | "inputTokens"
    | "cachedInputTokens"
    | "outputTokens"
    | "estimatedCostUsd"
  >
>;

/**
 * Atomic completion ownership. Only one UPDATE can win `status = running`.
 * The loser must not write usage, approvals, or notes.
 */
export async function takeOwnedRunningRun(
  db: Database,
  runId: string,
  runtimeId: string,
  patch: RunFinishPersist,
): Promise<Run | null> {
  const [row] = await db
    .update(runs)
    .set(patch)
    .where(and(eq(runs.id, runId), eq(runs.runtimeId, runtimeId), eq(runs.status, "running")))
    .returning();
  return row ? toRun(row) : null;
}

export async function takeRunningRun(
  db: Database,
  runId: string,
  patch: RunFinishPersist,
): Promise<Run | null> {
  const [row] = await db
    .update(runs)
    .set(patch)
    .where(and(eq(runs.id, runId), eq(runs.status, "running")))
    .returning();
  return row ? toRun(row) : null;
}

export async function takeOwnedRunningJob(
  db: Database,
  jobId: string,
  runtimeId: string,
  status: Job["status"],
): Promise<Job | null> {
  const [row] = await db
    .update(jobs)
    .set({ status })
    .where(
      and(eq(jobs.id, jobId), eq(jobs.status, "running"), eq(jobs.claimedByRuntimeId, runtimeId)),
    )
    .returning();
  return row ? toJob(row) : null;
}

export async function insertApproval(
  db: Database,
  values: {
    runId: string;
    jobId: string;
    kind: Approval["kind"];
    title: string;
    body: string;
  },
): Promise<Approval> {
  const [row] = await db
    .insert(approvals)
    .values({
      runId: values.runId,
      jobId: values.jobId,
      kind: values.kind,
      title: values.title,
      body: values.body,
    })
    .returning();

  if (!row) throw new Error("Insert returned no approval.");
  return toApproval(row);
}

export async function findApprovalById(db: Database, id: string): Promise<Approval | null> {
  const [row] = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
  return row ? toApproval(row) : null;
}

/**
 * Atomically take a pending approval. Only one caller can win: the UPDATE
 * matches `status = pending`, so a second concurrent resolve gets no row
 * and must not apply a side effect.
 */
export async function takePendingApproval(
  db: Database,
  id: string,
  patch: Pick<Approval, "status" | "resolvedAt"> &
    Partial<Pick<Approval, "standingAuthorityId" | "standingAuthorityKey" | "acceptedNoteId">>,
): Promise<Approval | null> {
  const [row] = await db
    .update(approvals)
    .set(patch)
    .where(and(eq(approvals.id, id), eq(approvals.status, "pending")))
    .returning();

  return row ? toApproval(row) : null;
}

export async function updateApproval(
  db: Database,
  id: string,
  patch: Partial<
    Pick<
      Approval,
      "status" | "resolvedAt" | "acceptedNoteId" | "standingAuthorityId" | "standingAuthorityKey"
    >
  >,
): Promise<Approval | null> {
  const [row] = await db.update(approvals).set(patch).where(eq(approvals.id, id)).returning();
  return row ? toApproval(row) : null;
}

export interface JobBoardRow {
  job: Job;
  claimedRuntimeKind: RuntimeKind | null;
  claimedRuntimeName: string | null;
  claimedRuntimeInstanceKey: string | null;
  latestRun: Run | null;
  pendingApproval: Approval | null;
  latestApproval: Approval | null;
}

export async function listRecentJobs(db: Database, limit = 50): Promise<JobBoardRow[]> {
  const rows = await db.query.jobs.findMany({
    with: {
      claimedByRuntime: true,
      runs: { orderBy: [desc(runs.startedAt)], limit: 1 },
      approvals: { orderBy: [desc(approvals.createdAt)], limit: 1 },
    },
    orderBy: [desc(jobs.createdAt)],
    limit,
  });

  return rows.map((row) => {
    const { claimedByRuntime, runs: runRows, approvals: approvalRows, ...job } = row;
    const latestApproval = approvalRows[0] ? toApproval(approvalRows[0]) : null;
    return {
      job: toJob(job),
      claimedRuntimeKind: claimedByRuntime?.kind ?? null,
      claimedRuntimeName: claimedByRuntime?.name ?? null,
      claimedRuntimeInstanceKey: claimedByRuntime?.instanceKey ?? null,
      latestRun: runRows[0] ? toRun(runRows[0]) : null,
      pendingApproval: latestApproval?.status === "pending" ? latestApproval : null,
      latestApproval,
    };
  });
}

export async function listRunningObserveAttempts(db: Database): Promise<{ job: Job; run: Run }[]> {
  const rows = await db
    .select({ job: jobs, run: runs })
    .from(jobs)
    .innerJoin(runs, eq(runs.jobId, jobs.id))
    .where(
      and(
        eq(jobs.status, "running"),
        eq(jobs.authorization, "observe"),
        eq(runs.status, "running"),
      ),
    );

  return rows.map((row) => ({ job: toJob(row.job), run: toRun(row.run) }));
}
