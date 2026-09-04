import { DomainError } from "@/domain/shared/errors";
import { MAX_OBSERVE_ATTEMPTS, OBSERVE_RUN_LEASE_MS } from "./schedule";
import type { Job, JobStatus, Run, RunStatus } from "./runtime";

/**
 * Recover a crashed observe attempt.
 *
 * Only `observe` jobs. A propose / modify_local / external_action run may
 * have already done something that must not be repeated by blindly
 * requeueing. Heartbeat (or startedAt when none was sent) is the lease.
 */

export type RecoverStale =
  | { applicable: false; reason: "not_observe" | "not_running" | "fresh" }
  | {
      applicable: true;
      run: { status: RunStatus; resultSummary: string; finishedAt: Date };
      job: { status: JobStatus; claimedByRuntimeId: null; claimedAt: null };
    };

export function recoverStaleObserveAttempt(
  job: Pick<Job, "status" | "authorization" | "attemptCount">,
  run: Pick<Run, "status" | "startedAt" | "lastHeartbeatAt">,
  now: Date,
  leaseMs = OBSERVE_RUN_LEASE_MS,
): RecoverStale {
  if (job.authorization !== "observe") return { applicable: false, reason: "not_observe" };
  if (job.status !== "running" || run.status !== "running") {
    return { applicable: false, reason: "not_running" };
  }

  const leaseStart = run.lastHeartbeatAt ?? run.startedAt;
  if (now.getTime() - leaseStart.getTime() <= leaseMs) {
    return { applicable: false, reason: "fresh" };
  }

  const exhausted = job.attemptCount >= MAX_OBSERVE_ATTEMPTS;
  return {
    applicable: true,
    run: {
      status: "failed",
      resultSummary: exhausted
        ? "Recovered: attempt limit reached."
        : "Recovered: attempt went stale.",
      finishedAt: now,
    },
    job: {
      status: exhausted ? "failed" : "queued",
      claimedByRuntimeId: null,
      claimedAt: null,
    },
  };
}

export function assertCurrentAttempt(
  job: Pick<Job, "status" | "claimedByRuntimeId">,
  run: Pick<Run, "runtimeId" | "status">,
): void {
  if (
    run.status !== "running" ||
    job.status !== "running" ||
    job.claimedByRuntimeId !== run.runtimeId
  ) {
    throw new DomainError("invalid_transition", "This attempt is no longer the current claim.");
  }
}
