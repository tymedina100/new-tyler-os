import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { Approval, Job, Run, Runtime, RuntimeKind, Role } from "@/domain/runtime/runtime";
import { RUNTIME_KIND_LABELS } from "@/domain/runtime/runtime";
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

export async function upsertRuntimeByKind(
  db: Database,
  kind: RuntimeKind,
  now: Date,
): Promise<Runtime> {
  const [row] = await db
    .insert(runtimes)
    .values({
      name: RUNTIME_KIND_LABELS[kind],
      kind,
      status: "enabled",
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: runtimes.kind,
      set: { lastSeenAt: now },
    })
    .returning();

  if (!row) throw new Error("Upsert returned no runtime.");
  return toRuntime(row);
}

export async function insertJob(
  db: Database,
  values: {
    kind: Job["kind"];
    title: string;
    instruction: string;
    authorization: Job["authorization"];
    assignedRole: Role;
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
    })
    .returning();

  if (!row) throw new Error("Insert returned no job.");
  return toJob(row);
}

export async function lockNextQueuedJob(
  db: Database,
  role: Role,
  runtimeKind: RuntimeKind,
): Promise<Job | null> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "queued"),
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
  patch: Partial<Pick<Job, "status" | "claimedByRuntimeId" | "claimedAt">>,
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
  patch: Pick<Approval, "status" | "resolvedAt">,
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
  patch: Partial<Pick<Approval, "status" | "resolvedAt" | "acceptedNoteId">>,
): Promise<Approval | null> {
  const [row] = await db.update(approvals).set(patch).where(eq(approvals.id, id)).returning();
  return row ? toApproval(row) : null;
}

export interface JobBoardRow {
  job: Job;
  claimedRuntimeKind: RuntimeKind | null;
  latestRun: Run | null;
  pendingApproval: Approval | null;
}

export async function listRecentJobs(db: Database, limit = 50): Promise<JobBoardRow[]> {
  const rows = await db.query.jobs.findMany({
    with: {
      claimedByRuntime: true,
      runs: { orderBy: [desc(runs.startedAt)], limit: 1 },
      approvals: { where: eq(approvals.status, "pending") },
    },
    orderBy: [desc(jobs.createdAt)],
    limit,
  });

  return rows.map((row) => {
    const { claimedByRuntime, runs: runRows, approvals: approvalRows, ...job } = row;
    return {
      job: toJob(job),
      claimedRuntimeKind: claimedByRuntime?.kind ?? null,
      latestRun: runRows[0] ? toRun(runRows[0]) : null,
      pendingApproval: approvalRows[0] ? toApproval(approvalRows[0]) : null,
    };
  });
}
