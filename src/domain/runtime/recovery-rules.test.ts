import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/shared/errors";
import { MAX_OBSERVE_ATTEMPTS, OBSERVE_RUN_LEASE_MS } from "./schedule";
import { assertCurrentAttempt, recoverStaleObserveAttempt } from "./recovery-rules";

const STARTED = new Date("2026-09-07T13:20:00.000Z");
const FRESH = new Date(STARTED.getTime() + OBSERVE_RUN_LEASE_MS);
const STALE = new Date(STARTED.getTime() + OBSERVE_RUN_LEASE_MS + 1);

describe("recoverStaleObserveAttempt", () => {
  it("requeues an observe run past the lease", () => {
    const result = recoverStaleObserveAttempt(
      { status: "running", authorization: "observe", attemptCount: 1 },
      { status: "running", startedAt: STARTED, lastHeartbeatAt: null },
      STALE,
    );

    expect(result).toMatchObject({
      applicable: true,
      job: { status: "queued", claimedByRuntimeId: null },
      run: { status: "failed", resultSummary: "Recovered: attempt went stale." },
    });
  });

  it("uses heartbeat when present", () => {
    const heartbeat = new Date(STARTED.getTime() + 30_000);
    expect(
      recoverStaleObserveAttempt(
        { status: "running", authorization: "observe", attemptCount: 1 },
        { status: "running", startedAt: STARTED, lastHeartbeatAt: heartbeat },
        new Date(heartbeat.getTime() + OBSERVE_RUN_LEASE_MS),
      ).applicable,
    ).toBe(false);
  });

  it("fails the job after three attempts", () => {
    const result = recoverStaleObserveAttempt(
      { status: "running", authorization: "observe", attemptCount: MAX_OBSERVE_ATTEMPTS },
      { status: "running", startedAt: STARTED, lastHeartbeatAt: null },
      STALE,
    );

    expect(result).toMatchObject({
      applicable: true,
      job: { status: "failed" },
      run: { resultSummary: "Recovered: attempt limit reached." },
    });
  });

  it("never auto-retries non-observe work", () => {
    expect(
      recoverStaleObserveAttempt(
        { status: "running", authorization: "propose", attemptCount: 1 },
        { status: "running", startedAt: STARTED, lastHeartbeatAt: null },
        STALE,
      ),
    ).toEqual({ applicable: false, reason: "not_observe" });
  });

  it("leaves a fresh observe run alone", () => {
    expect(
      recoverStaleObserveAttempt(
        { status: "running", authorization: "observe", attemptCount: 1 },
        { status: "running", startedAt: STARTED, lastHeartbeatAt: null },
        FRESH,
      ),
    ).toEqual({ applicable: false, reason: "fresh" });
  });
});

describe("assertCurrentAttempt", () => {
  it("refuses a recovered run", () => {
    expect(() =>
      assertCurrentAttempt(
        { status: "queued", claimedByRuntimeId: null },
        { runtimeId: "runtime-1", status: "failed" },
      ),
    ).toThrow(DomainError);
  });

  it("lets the current claim finish", () => {
    expect(() =>
      assertCurrentAttempt(
        { status: "running", claimedByRuntimeId: "runtime-1" },
        { runtimeId: "runtime-1", status: "running" },
      ),
    ).not.toThrow();
  });
});
