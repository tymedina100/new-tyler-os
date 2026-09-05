import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { aiExecutionProfiles, capacityPools } from "@/server/db/schema";
import * as itemService from "@/server/items/item-service";
import * as noteService from "@/server/notes/note-service";
import * as profileService from "@/server/runtime/ai-profile-service";
import { briefAiRun, enqueueTodayBriefingAi } from "@/server/runtime/briefing-service";
import * as capacityRepo from "@/server/runtime/capacity-repository";
import * as runtimeService from "@/server/runtime/runtime-service";
import { registerMilesRuntime } from "../support/runtime-fixtures";
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

const NOW = new Date("2026-09-05T12:00:00.000Z");
const VALID_JSON = JSON.stringify({
  summary: "Review the runtime PR today.",
  priorities: ["Review TylerOS runtime PR"],
  needsTyler: ["Accept or comment on the PR."],
  watch: [],
});

describe("AI execution profiles", () => {
  it("stores metadata only and rejects a duplicate key", async () => {
    const created = await profileService.createAiExecutionProfile(db(), {
      key: "miles-briefing-primary",
      name: "Miles Briefing Primary",
      provider: "anthropic",
      model: "claude-opus-5",
      product: null,
      poolKey: null,
      enabled: true,
    });
    expect(created.model).toBe("claude-opus-5");

    const [row] = await db().select().from(aiExecutionProfiles);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("apiKey");
    expect(row).not.toHaveProperty("api_key");
    expect(JSON.stringify(row)).not.toMatch(/sk-ant|secret|api[_-]?key/i);

    await expect(
      profileService.createAiExecutionProfile(db(), {
        key: "miles-briefing-primary",
        name: "Copy",
        provider: "anthropic",
        model: "claude-opus-5",
        product: null,
        poolKey: null,
        enabled: true,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("does not enqueue against a disabled profile or invent a default", async () => {
    const disabled = await profileService.createAiExecutionProfile(db(), {
      key: "miles-briefing-off",
      name: "Off",
      provider: "anthropic",
      model: "claude-opus-5",
      product: null,
      poolKey: null,
      enabled: false,
    });

    await expect(enqueueTodayBriefingAi(db(), disabled.id)).rejects.toThrow(/disabled/);
    await expect(enqueueTodayBriefingAi(db(), "")).rejects.toThrow(/will not choose/);
    expect(await profileService.listEnabledAiExecutionProfiles(db())).toHaveLength(0);
  });
});

describe("Miles AI briefing job", () => {
  it("belongs to Miles, stays unpinned, and records the selected profile", async () => {
    const profile = await enabledProfile();
    const job = await enqueueTodayBriefingAi(db(), profile.id);
    expect(job.kind).toBe("today_briefing_ai");
    expect(job.assignedRole).toBe("miles");
    expect(job.requestedRuntimeKind).toBeNull();
    expect(job.aiExecutionProfileId).toBe(profile.id);
    expect(job.authorization).toBe("observe");
  });

  it("lets a Python runtime claim the Miles AI job", async () => {
    const profile = await enabledProfile();
    const job = await enqueueTodayBriefingAi(db(), profile.id);
    const runtime = await registerMilesRuntime(db(), "home-desktop-python");
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeId: runtime.id,
      role: "miles",
    });
    expect(claimed?.job.id).toBe(job.id);
    expect(claimed?.run.role).toBe("miles");
  });
});

describe("zero-AI fast path", () => {
  it("completes empty Today without calling the provider and records deterministic usage", async () => {
    const { claimed, runtime } = await claimAiJob();
    let calls = 0;
    const outcome = await briefAiRun(
      db(),
      claimed.run.id,
      runtime.id,
      async () => {
        calls += 1;
        throw new Error("provider must not be called");
      },
      NOW,
    );

    expect(outcome.status).toBe("succeeded");
    expect(calls).toBe(0);
    expect(await noteService.listNotes(db())).toHaveLength(0);
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("succeeded");
    expect(row?.pendingApproval).toBeNull();
    expect(row?.latestRun?.provider).toBe("none");
    expect(row?.latestRun?.model).toBe("deterministic");

    const usage = await capacityRepo.listUsageForRun(db(), claimed.run.id);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      provider: "none",
      model: "deterministic",
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    });
  });
});

describe("structured AI briefing", () => {
  it("creates exactly one approval from valid output and records usage plus pool", async () => {
    const pool = await insertPool(40);
    const { claimed, runtime, profile } = await claimAiJob(pool.poolKey);
    await addDueTodayItem();

    const outcome = await briefAiRun(
      db(),
      claimed.run.id,
      runtime.id,
      async (request) => {
        expect(request.model).toBe(profile.model);
        expect(request.prompt).toContain("Review TylerOS runtime PR");
        expect(request.prompt).toContain("data");
        return {
          ok: true,
          text: VALID_JSON,
          model: "claude-opus-5-20251101",
          usage: { inputTokens: 1234, cachedInputTokens: 10, outputTokens: 182 },
        };
      },
      NOW,
    );

    expect(outcome.status).toBe("needs_approval");
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.pendingApproval).toBeTruthy();
    expect(row?.job.status).toBe("needs_approval");
    expect(row?.latestRun).toMatchObject({
      provider: "anthropic",
      model: "claude-opus-5-20251101",
      inputTokens: 1234,
      cachedInputTokens: 10,
      outputTokens: 182,
    });

    const usage = await capacityRepo.listUsageForRun(db(), claimed.run.id);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      runId: claimed.run.id,
      runtimeId: runtime.id,
      provider: "anthropic",
      product: "Anthropic API",
      poolKey: pool.poolKey,
      model: "claude-opus-5-20251101",
      inputTokens: 1234,
      cachedInputTokens: 10,
      outputTokens: 182,
      estimatedCostUsd: null,
    });

    const remaining = await capacityRepo.findCapacityPoolById(db(), pool.id);
    expect(remaining?.remaining).toBe(40);

    const approvalId = row?.pendingApproval?.id;
    if (!approvalId) throw new Error("expected approval");
    await runtimeService.acceptApproval(db(), approvalId);
    const notes = await noteService.listNotes(db());
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toContain("Review TylerOS runtime PR");
  });

  it("creates no approval or note when structured output is malformed, but keeps usage", async () => {
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();

    const outcome = await briefAiRun(
      db(),
      claimed.run.id,
      runtime.id,
      async () => ({
        ok: true,
        text: "Sure, here is a briefing in markdown.",
        model: "claude-opus-5",
        usage: { inputTokens: 80, cachedInputTokens: 0, outputTokens: 40 },
      }),
      NOW,
    );

    expect(outcome.status).toBe("failed");
    expect(await noteService.listNotes(db())).toHaveLength(0);
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.pendingApproval).toBeNull();
    expect(row?.job.status).toBe("failed");
    const usage = await capacityRepo.listUsageForRun(db(), claimed.run.id);
    expect(usage[0]).toMatchObject({
      provider: "anthropic",
      model: "claude-opus-5",
      inputTokens: 80,
      outputTokens: 40,
      estimatedCostUsd: null,
    });
  });

  it("creates no note when the proposal is dismissed", async () => {
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();
    await briefAiRun(
      db(),
      claimed.run.id,
      runtime.id,
      async () => ({
        ok: true,
        text: VALID_JSON,
        model: "claude-opus-5",
        usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 4 },
      }),
      NOW,
    );
    const [row] = await runtimeService.listRuntimeBoard(db());
    const approvalId = row?.pendingApproval?.id;
    if (!approvalId) throw new Error("expected approval");
    await runtimeService.dismissApproval(db(), approvalId);
    expect(await noteService.listNotes(db())).toHaveLength(0);
  });

  it("fails a missing API key without a proposal", async () => {
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();
    const outcome = await briefAiRun(
      db(),
      claimed.run.id,
      runtime.id,
      async () => ({ ok: false, failure: "not_configured", usage: null }),
      NOW,
    );
    expect(outcome.status).toBe("failed");
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.pendingApproval).toBeNull();
    expect(row?.latestRun?.resultSummary).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("does not let another runtime complete the AI brief", async () => {
    const { claimed } = await claimAiJob();
    const other = await registerMilesRuntime(db(), "backup-python");
    await expect(
      briefAiRun(
        db(),
        claimed.run.id,
        other.id,
        async () => {
          throw new Error("must not call");
        },
        NOW,
      ),
    ).rejects.toThrow(/different runtime/);
  });

  it("lets only one concurrent /brief own the provider call", async () => {
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;

    const caller = async () => {
      calls += 1;
      await gate;
      return {
        ok: true as const,
        text: VALID_JSON,
        model: "claude-opus-5",
        usage: { inputTokens: 11, cachedInputTokens: 0, outputTokens: 3 },
      };
    };

    const first = track(briefAiRun(db(), claimed.run.id, runtime.id, caller, NOW));
    const second = track(briefAiRun(db(), claimed.run.id, runtime.id, caller, NOW));

    await vi.waitFor(() => {
      expect(calls).toBe(1);
    });

    const loserError = await Promise.race([
      first.settled.then((result) => (result.ok ? hang() : result.error)),
      second.settled.then((result) => (result.ok ? hang() : result.error)),
    ]);
    expect(loserError).toMatchObject({
      message: "This run's AI request has already started.",
    });
    expect(calls).toBe(1);

    release();
    const settled = await Promise.all([first.settled, second.settled]);
    const fulfilled = settled.filter((result) => result.ok);
    const rejected = settled.filter((result) => !result.ok);

    expect(calls).toBe(1);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0]).toMatchObject({ value: { status: "needs_approval" } });

    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.pendingApproval).toBeTruthy();
    expect(await capacityRepo.listUsageForRun(db(), claimed.run.id)).toHaveLength(1);
    expect(await noteService.listNotes(db())).toHaveLength(0);
  });
});

describe("fresh migration", () => {
  it("does not seed AI execution profiles", async () => {
    const fresh = await createTestDatabase();
    try {
      const rows = await fresh.db.select({ id: aiExecutionProfiles.id }).from(aiExecutionProfiles);
      expect(rows).toHaveLength(0);
    } finally {
      await fresh.close();
    }
  });
});

async function enabledProfile(poolKey?: string | null) {
  return profileService.createAiExecutionProfile(db(), {
    key: "miles-briefing-primary",
    name: "Miles Briefing Primary",
    provider: "anthropic",
    model: "claude-opus-5",
    product: "Anthropic API",
    poolKey: poolKey ?? null,
    enabled: true,
  });
}

async function claimAiJob(poolKey?: string) {
  const profile = await enabledProfile(poolKey);
  const job = await enqueueTodayBriefingAi(db(), profile.id);
  const runtime = await registerMilesRuntime(db(), "home-desktop-python");
  const claimed = await runtimeService.claimNextJob(db(), {
    runtimeId: runtime.id,
    role: "miles",
  });
  if (!claimed) throw new Error("expected a claim");
  expect(claimed.job.id).toBe(job.id);
  return { claimed, runtime, profile };
}

async function addDueTodayItem() {
  const id = await itemService.captureItem(db(), {
    text: "Review TylerOS runtime PR",
    projectId: null,
  });
  await itemService.updateItem(db(), {
    id,
    title: "Review TylerOS runtime PR",
    body: null,
    kind: "task",
    status: "active",
    dueOn: "2026-09-05",
    tags: [],
    projectId: null,
    recurrence: null,
  });
}

async function insertPool(remaining: number) {
  const [row] = await db()
    .insert(capacityPools)
    .values({
      provider: "anthropic",
      product: "Anthropic API",
      poolKey: "anthropic-api-payg",
      displayName: "Anthropic API",
      remaining,
      remainingUnit: "usd",
      estimateConfidence: "estimated",
    })
    .returning();
  if (!row) throw new Error("expected pool");
  return row;
}

function track<T>(promise: Promise<T>): {
  settled: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>;
} {
  return {
    settled: promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  };
}

function hang(): Promise<never> {
  return new Promise(() => undefined);
}
