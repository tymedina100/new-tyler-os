import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deriveRuntimeHealth } from "@/domain/runtime/health";
import { authenticateRuntime, isAuthed } from "@/server/runtime/runtime-http";
import { bootstrapRuntime } from "@/server/runtime/fleet-service";
import { capacityPools, capacityUpdates, runtimeCredentials } from "@/server/db/schema";
import { listUsageForRun, updatePoolRemaining } from "@/server/runtime/capacity-service";
import * as capacityRepo from "@/server/runtime/capacity-repository";
import * as runtimeService from "@/server/runtime/runtime-service";
import { findRuntimeById } from "@/server/runtime/runtime-repository";
import { hashRuntimeSecret } from "@/server/runtime/runtime-token";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

let harness: TestDatabase;

beforeAll(async () => {
  harness = await createTestDatabase();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

function db() {
  return harness.db;
}

function request(headers: Record<string, string>) {
  return new Request("http://localhost/api/runtime/jobs/next", { headers });
}

describe("runtime fleet", () => {
  it("lets two python instances coexist and records which one ran", async () => {
    const home = await bootstrapRuntime(db(), {
      instanceKey: "home-desktop-python",
      name: "Home Desktop Python",
      kind: "python",
      roles: ["miles"],
    });
    const backup = await bootstrapRuntime(db(), {
      instanceKey: "backup-python",
      name: "Backup Python",
      kind: "python",
      roles: ["miles"],
    });

    expect(home.runtime.id).not.toBe(backup.runtime.id);
    expect(home.runtime.kind).toBe("python");
    expect(backup.runtime.kind).toBe("python");

    await runtimeService.enqueueTodayBriefing(db());
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeId: home.runtime.id,
      role: "miles",
    });
    expect(claimed?.run.runtimeId).toBe(home.runtime.id);
    expect(claimed?.run.runtimeId).not.toBe(backup.runtime.id);
  });

  it("derives healthy from a real claim last-seen, not fake presence", async () => {
    const home = await bootstrapRuntime(db(), {
      instanceKey: "home-desktop-python",
      name: "Home Desktop Python",
      kind: "python",
      roles: ["miles"],
    });
    expect(home.runtime.lastSeenAt).toBeNull();
    const now = new Date("2026-09-04T12:00:00.000Z");
    expect(deriveRuntimeHealth(home.runtime.status, home.runtime.lastSeenAt, now)).toBe("offline");

    await runtimeService.enqueueTodayBriefing(db());
    await runtimeService.claimNextJob(db(), { runtimeId: home.runtime.id, role: "miles" }, now);

    const after = await findRuntimeById(db(), home.runtime.id);
    expect(after?.lastSeenAt?.toISOString()).toBe(now.toISOString());
    expect(deriveRuntimeHealth("enabled", after?.lastSeenAt ?? null, now)).toBe("healthy");
    expect(
      deriveRuntimeHealth(
        "enabled",
        after?.lastSeenAt ?? null,
        new Date(now.getTime() + 11 * 60_000),
      ),
    ).toBe("offline");
  });

  it("rejects an invalid runtime credential", async () => {
    const response = await authenticateRuntime(
      db(),
      request({
        Authorization: "Bearer not-a-real-runtime-credential-value-xx",
        "X-TylerOS-Role": "miles",
      }),
    );
    expect(isAuthed(response)).toBe(false);
    if (!isAuthed(response)) {
      expect(response.status).toBe(401);
    }
  });

  it("does not let runtime A impersonate runtime B", async () => {
    const home = await bootstrapRuntime(db(), {
      instanceKey: "home-desktop-python",
      name: "Home Desktop Python",
      kind: "python",
      roles: ["miles"],
    });
    const backup = await bootstrapRuntime(db(), {
      instanceKey: "backup-python",
      name: "Backup Python",
      kind: "python",
      roles: ["miles"],
    });

    await runtimeService.enqueueTodayBriefing(db());
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeId: home.runtime.id,
      role: "miles",
    });
    if (!claimed) throw new Error("expected a claim");

    await expect(
      runtimeService.completeRun(db(), claimed.run.id, backup.runtime.id, {
        status: "succeeded",
        resultSummary: "impersonation",
      }),
    ).rejects.toThrow(/different runtime/);

    const asBackup = await authenticateRuntime(
      db(),
      request({
        Authorization: `Bearer ${backup.token}`,
        "X-TylerOS-Role": "miles",
        "X-TylerOS-Runtime-Kind": "python",
      }),
    );
    expect(isAuthed(asBackup)).toBe(true);
    if (!isAuthed(asBackup)) throw new Error("expected backup identity");
    expect(asBackup.runtime.id).toBe(backup.runtime.id);

    const hashes = await db()
      .select({ hash: runtimeCredentials.tokenHash })
      .from(runtimeCredentials)
      .where(eq(runtimeCredentials.runtimeId, home.runtime.id));
    expect(hashes[0]?.hash).toBe(hashRuntimeSecret(home.token));
    expect(hashes[0]?.hash).not.toBe(home.token);
  });

  it("derives stale then offline health from last seen", async () => {
    const now = new Date("2026-09-04T12:00:00.000Z");
    expect(deriveRuntimeHealth("enabled", new Date(now.getTime() - 18_000), now)).toBe("healthy");
    expect(deriveRuntimeHealth("enabled", new Date(now.getTime() - 3 * 60_000), now)).toBe("stale");
    expect(deriveRuntimeHealth("enabled", new Date(now.getTime() - 11 * 60_000), now)).toBe(
      "offline",
    );
  });

  it("appends a zero-AI usage entry for deterministic complete", async () => {
    const home = await bootstrapRuntime(db(), {
      instanceKey: "home-desktop-python",
      name: "Home Desktop Python",
      kind: "python",
      roles: ["miles"],
    });
    await runtimeService.enqueueTodayBriefing(db());
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeId: home.runtime.id,
      role: "miles",
    });
    if (!claimed) throw new Error("expected a claim");

    await runtimeService.completeRun(db(), claimed.run.id, home.runtime.id, {
      status: "succeeded",
      resultSummary: "No material Today items.",
      usage: {
        provider: "none",
        model: "deterministic",
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
      },
    });

    const entries = await listUsageForRun(db(), claimed.run.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      runtimeId: home.runtime.id,
      provider: "none",
      model: "deterministic",
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    });
  });
});

describe("capacity ledger", () => {
  it("allows multiple pools under one provider and audits remaining updates", async () => {
    await db()
      .insert(capacityPools)
      .values([
        {
          provider: "openai",
          product: "ChatGPT subscription",
          poolKey: "example_chatgpt_subscription",
          displayName: "ChatGPT subscription (example)",
          remaining: 60,
          remainingUnit: "percent",
          estimateConfidence: "estimated",
          resetType: "monthly",
          resetAt: new Date("2026-10-01T07:00:00.000Z"),
          resetTimezone: "America/Phoenix",
          sourceNote: "Example / mock — not a real Tyler subscription limit.",
        },
        {
          provider: "openai",
          product: "PAYG API",
          poolKey: "example_openai_payg_api",
          displayName: "PAYG API budget (example)",
          remaining: 25,
          remainingUnit: "usd",
          estimateConfidence: "estimated",
          resetType: "monthly",
          resetAt: new Date("2026-10-01T07:00:00.000Z"),
          resetTimezone: "America/Phoenix",
          hardDollarLimit: 50,
          sourceNote: "Example / mock — not a real Tyler subscription limit.",
        },
      ]);

    const pools = await capacityRepo.listCapacityPools(db());
    const openai = pools.filter((pool) => pool.provider === "openai");
    expect(openai).toHaveLength(2);

    const payg = openai.find((pool) => pool.poolKey === "example_openai_payg_api");
    if (!payg) throw new Error("expected payg pool");
    expect(payg.resetTimezone).toBe("America/Phoenix");
    expect(payg.resetAt?.toISOString()).toBe("2026-10-01T07:00:00.000Z");

    await expect(updatePoolRemaining(db(), { poolId: payg.id, remaining: -1 })).rejects.toThrow(
      /cannot be negative/,
    );

    const updated = await updatePoolRemaining(db(), {
      poolId: payg.id,
      remaining: 18,
      estimateConfidence: "estimated",
      note: "Manual mock remaining.",
    });
    expect(updated.remaining).toBe(18);

    const [audit] = await db()
      .select()
      .from(capacityUpdates)
      .where(eq(capacityUpdates.poolId, payg.id));
    expect(audit?.previousRemaining).toBe(25);
    expect(audit?.newRemaining).toBe(18);
    expect(audit?.note).toBe("Manual mock remaining.");
  });
});
