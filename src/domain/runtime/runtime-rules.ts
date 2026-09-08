import { DomainError } from "@/domain/shared/errors";
import {
  ROLE_TITLES,
  type Approval,
  type ApprovalStatus,
  type Job,
  type JobKind,
  type JobStatus,
  type Role,
  type Run,
  type RuntimeKind,
  type RuntimeStatus,
  type RunStatus,
  type RunUsage,
} from "./runtime";

/**
 * Pure transitions for the runtime control plane.
 *
 * A job is owned by a role. A runtime may claim it only while acting as that
 * role. Swapping Grok for Python does not change who the work belongs to.
 */

export interface JobStatusPatch {
  status: JobStatus;
  claimedByRuntimeId: string | null;
  claimedAt: Date | null;
  attemptCount: number;
}

export interface RunFinishPatch extends RunUsage {
  status: RunStatus;
  resultSummary: string | null;
  finishedAt: Date;
}

export interface ApprovalStatusPatch {
  status: ApprovalStatus;
  resolvedAt: Date;
}

export interface ClaimingRuntime {
  runtimeId: string;
  runtimeKind: RuntimeKind;
  role: Role;
}

export function claimQueuedJob(
  job: Pick<Job, "status" | "assignedRole" | "requestedRuntimeKind" | "attemptCount">,
  claiming: ClaimingRuntime,
  now: Date,
): JobStatusPatch {
  if (job.status !== "queued") {
    throw new DomainError("invalid_transition", "Only a queued job can be claimed.");
  }

  if (claiming.role !== job.assignedRole) {
    throw new DomainError(
      "invalid_transition",
      `This job belongs to ${titleCase(job.assignedRole)} (${ROLE_TITLES[job.assignedRole]}), not ${titleCase(claiming.role)}.`,
    );
  }

  if (job.requestedRuntimeKind !== null && job.requestedRuntimeKind !== claiming.runtimeKind) {
    throw new DomainError(
      "invalid_transition",
      `This job is pinned to the ${job.requestedRuntimeKind} runtime.`,
    );
  }

  return {
    status: "running",
    claimedByRuntimeId: claiming.runtimeId,
    claimedAt: now,
    attemptCount: job.attemptCount + 1,
  };
}

export function heartbeatRunningRun(
  run: Pick<Run, "status">,
  now: Date,
): { lastHeartbeatAt: Date } {
  if (run.status !== "running") {
    throw new DomainError("invalid_transition", "Only a running attempt can send a heartbeat.");
  }

  return { lastHeartbeatAt: now };
}

export type RunOutcome = "succeeded" | "failed";

/**
 * Who is completing the run. The HTTP worker boundary is `runtime`.
 * `validated_ai` is only the in-process path after Miles judgment parsed.
 * This is not a client-supplied flag.
 */
export type RunCompletionSource = "runtime" | "validated_ai";

export function proposalAllowedForCompletion<T>(
  jobKind: JobKind,
  proposal: T | undefined,
  source: RunCompletionSource,
): T | undefined {
  if (proposal === undefined) return undefined;
  if (jobKind === "today_briefing_ai" && source !== "validated_ai") {
    throw new DomainError(
      "invalid_transition",
      "An AI briefing can only propose a note after TylerOS validates Miles judgment.",
    );
  }
  return proposal;
}

export function completeRunningJob(
  job: Pick<Job, "status">,
  run: Pick<Run, "status">,
  outcome: RunOutcome,
  hasProposal: boolean,
  authorizedByStandingAuthority = false,
): { jobStatus: JobStatus } {
  if (job.status !== "running") {
    throw new DomainError("invalid_transition", "Only a running job can be completed.");
  }
  if (run.status !== "running") {
    throw new DomainError("invalid_transition", "Only a running attempt can be completed.");
  }

  if (outcome === "failed") return { jobStatus: "failed" };
  if (!hasProposal) return { jobStatus: "succeeded" };
  if (authorizedByStandingAuthority) return { jobStatus: "succeeded" };
  return { jobStatus: "needs_approval" };
}

export function finishRun(
  run: Pick<Run, "status">,
  outcome: RunOutcome,
  now: Date,
  resultSummary: string | null,
  usage: RunUsage,
): RunFinishPatch {
  if (run.status !== "running") {
    throw new DomainError("invalid_transition", "Only a running attempt can be finished.");
  }

  return {
    status: outcome === "failed" ? "failed" : "succeeded",
    resultSummary,
    finishedAt: now,
    provider: usage.provider,
    model: usage.model,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
  };
}

export type ApprovalDecision = "accepted" | "dismissed";

export type ReconcileApproval =
  { applicable: true } | { applicable: false; reason: "already_resolved" };

export function reconcileApproval(approval: Pick<Approval, "status">): ReconcileApproval {
  if (approval.status !== "pending") {
    return { applicable: false, reason: "already_resolved" };
  }

  return { applicable: true };
}

export function resolveApproval(
  approval: Pick<Approval, "status">,
  decision: ApprovalDecision,
  now: Date,
): ApprovalStatusPatch {
  const reconciled = reconcileApproval(approval);
  if (!reconciled.applicable) {
    throw new DomainError("invalid_transition", "This proposal has already been resolved.");
  }

  return { status: decision, resolvedAt: now };
}

export function resolveUnderStandingAuthority(
  approval: Pick<Approval, "status">,
  now: Date,
): ApprovalStatusPatch {
  const reconciled = reconcileApproval(approval);
  if (!reconciled.applicable) {
    throw new DomainError("invalid_transition", "This proposal has already been resolved.");
  }

  return { status: "auto_executed", resolvedAt: now };
}

export function settleApprovedJob(job: Pick<Job, "status">): { status: JobStatus } {
  if (job.status !== "needs_approval") {
    throw new DomainError("invalid_transition", "Only a job waiting on approval can be settled.");
  }

  return { status: "succeeded" };
}

export function assertRuntimeEnabled(status: RuntimeStatus): void {
  if (status !== "enabled") {
    throw new DomainError("invalid_transition", "This runtime is disabled.");
  }
}

/** Capture goes through `noteService`; this only decides the body it receives. */
export function proposedNoteCaptureBody(title: string, body: string): string {
  const trimmed = body.trimStart();
  if (trimmed === title || trimmed.startsWith(`${title}\n`) || trimmed.startsWith(`${title}\r\n`)) {
    return body;
  }

  return `${title}\n\n${body}`;
}

export function emptyUsage(): RunUsage {
  return {
    provider: null,
    model: null,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    estimatedCostUsd: null,
  };
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
