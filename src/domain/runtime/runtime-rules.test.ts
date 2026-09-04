import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/shared/errors";
import {
  assertRuntimeEnabled,
  claimQueuedJob,
  completeRunningJob,
  emptyUsage,
  finishRun,
  heartbeatRunningRun,
  proposedNoteCaptureBody,
  reconcileApproval,
  resolveApproval,
  settleApprovedJob,
} from "./runtime-rules";

const NOW = new Date("2026-09-04T12:00:00.000Z");

const milesPython = {
  runtimeId: "runtime-1",
  runtimeKind: "python" as const,
  role: "miles" as const,
};

describe("claimQueuedJob", () => {
  it("lets a runtime acting as Miles claim a Miles job", () => {
    expect(
      claimQueuedJob(
        { status: "queued", assignedRole: "miles", requestedRuntimeKind: null, attemptCount: 0 },
        milesPython,
        NOW,
      ),
    ).toEqual({
      status: "running",
      claimedByRuntimeId: "runtime-1",
      claimedAt: NOW,
      attemptCount: 1,
    });
  });

  it("refuses when the runtime is acting as the wrong role", () => {
    expect(() =>
      claimQueuedJob(
        { status: "queued", assignedRole: "miles", requestedRuntimeKind: null, attemptCount: 0 },
        { ...milesPython, role: "scout" },
        NOW,
      ),
    ).toThrow(/belongs to Miles/);
  });

  it("refuses when the job is pinned to a different runtime kind", () => {
    expect(() =>
      claimQueuedJob(
        {
          status: "queued",
          assignedRole: "miles",
          requestedRuntimeKind: "grok_bot",
          attemptCount: 0,
        },
        milesPython,
        NOW,
      ),
    ).toThrow(/pinned to the grok_bot runtime/);
  });

  it("accepts a Grok runtime for the same Miles job when no pin is set", () => {
    const patch = claimQueuedJob(
      { status: "queued", assignedRole: "miles", requestedRuntimeKind: null, attemptCount: 0 },
      { runtimeId: "grok-1", runtimeKind: "grok_bot", role: "miles" },
      NOW,
    );
    expect(patch.claimedByRuntimeId).toBe("grok-1");
  });

  it("refuses to claim a job that is already in progress", () => {
    expect(() =>
      claimQueuedJob(
        { status: "running", assignedRole: "miles", requestedRuntimeKind: null, attemptCount: 1 },
        milesPython,
        NOW,
      ),
    ).toThrow(DomainError);
  });
});

describe("completeRunningJob", () => {
  it("waits on the user when a successful run carried a proposal", () => {
    expect(
      completeRunningJob({ status: "running" }, { status: "running" }, "succeeded", true),
    ).toEqual({ jobStatus: "needs_approval" });
  });

  it("succeeds immediately when there is nothing to approve", () => {
    expect(
      completeRunningJob({ status: "running" }, { status: "running" }, "succeeded", false),
    ).toEqual({ jobStatus: "succeeded" });
  });

  it("fails the job when the run failed, even if a proposal was attached", () => {
    expect(
      completeRunningJob({ status: "running" }, { status: "running" }, "failed", true),
    ).toEqual({ jobStatus: "failed" });
  });
});

describe("finishRun", () => {
  it("records success, a summary, and optional usage on the run", () => {
    expect(
      finishRun({ status: "running" }, "succeeded", NOW, "Wrote a briefing.", {
        provider: "none",
        model: "deterministic",
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      }),
    ).toMatchObject({
      status: "succeeded",
      resultSummary: "Wrote a briefing.",
      provider: "none",
      model: "deterministic",
    });
  });

  it("does not invent usage when none was reported", () => {
    expect(finishRun({ status: "running" }, "failed", NOW, null, emptyUsage()).provider).toBeNull();
  });
});

describe("heartbeatRunningRun", () => {
  it("stamps a running attempt", () => {
    expect(heartbeatRunningRun({ status: "running" }, NOW)).toEqual({ lastHeartbeatAt: NOW });
  });

  it("refuses a finished attempt", () => {
    expect(() => heartbeatRunningRun({ status: "succeeded" }, NOW)).toThrow(DomainError);
  });
});

describe("reconcileApproval and resolveApproval", () => {
  it("lets a pending proposal be accepted or dismissed", () => {
    expect(reconcileApproval({ status: "pending" })).toEqual({ applicable: true });
    expect(resolveApproval({ status: "pending" }, "accepted", NOW).status).toBe("accepted");
  });

  it("treats an already-resolved proposal as inapplicable", () => {
    expect(reconcileApproval({ status: "accepted" })).toEqual({
      applicable: false,
      reason: "already_resolved",
    });
    expect(() => resolveApproval({ status: "dismissed" }, "accepted", NOW)).toThrow(DomainError);
  });
});

describe("settleApprovedJob", () => {
  it("marks a waiting job succeeded once the user has decided", () => {
    expect(settleApprovedJob({ status: "needs_approval" })).toEqual({ status: "succeeded" });
  });
});

describe("assertRuntimeEnabled", () => {
  it("lets an enabled runtime continue", () => {
    expect(() => assertRuntimeEnabled("enabled")).not.toThrow();
  });

  it("refuses a disabled runtime", () => {
    expect(() => assertRuntimeEnabled("disabled")).toThrow(DomainError);
  });
});

describe("proposedNoteCaptureBody", () => {
  it("does not duplicate a title that is already the first line", () => {
    expect(proposedNoteCaptureBody("Today briefing", "Today briefing\n\n## Overdue")).toBe(
      "Today briefing\n\n## Overdue",
    );
  });

  it("prepends the title when the body is only sections", () => {
    expect(proposedNoteCaptureBody("Today briefing", "## Overdue\n- Pay rent")).toBe(
      "Today briefing\n\n## Overdue\n- Pay rent",
    );
  });
});
