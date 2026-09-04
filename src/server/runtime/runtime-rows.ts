import type { Approval, Job, Run, Runtime } from "@/domain/runtime/runtime";
import type { ApprovalRow, JobRow, RunRow, RuntimeRow } from "@/server/db/schema";

/** Row → domain. Kept beside the repository so mapping cannot drift into SQL. */

export function toRuntime(row: RuntimeRow): Runtime {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  };
}

export function toJob(row: JobRow): Job {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    instruction: row.instruction,
    status: row.status,
    authorization: row.authorization,
    assignedRole: row.assignedRole,
    requestedRuntimeKind: row.requestedRuntimeKind,
    claimedByRuntimeId: row.claimedByRuntimeId,
    claimedAt: row.claimedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRun(row: RunRow): Run {
  return {
    id: row.id,
    jobId: row.jobId,
    runtimeId: row.runtimeId,
    role: row.role,
    status: row.status,
    trigger: row.trigger,
    resultSummary: row.resultSummary,
    lastHeartbeatAt: row.lastHeartbeatAt,
    provider: row.provider,
    model: row.model,
    inputTokens: row.inputTokens,
    cachedInputTokens: row.cachedInputTokens,
    outputTokens: row.outputTokens,
    estimatedCostUsd: row.estimatedCostUsd,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

export function toApproval(row: ApprovalRow): Approval {
  return {
    id: row.id,
    runId: row.runId,
    jobId: row.jobId,
    kind: row.kind,
    status: row.status,
    title: row.title,
    body: row.body,
    acceptedNoteId: row.acceptedNoteId,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}
