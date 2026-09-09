import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { createTestDatabase, type TestDatabase } from "../support/test-database";
import { registerMilesRuntime } from "../support/runtime-fixtures";
import { createAiExecutionProfile } from "@/server/runtime/ai-profile-service";
import { enqueueTodayBriefingAi, briefAiRun } from "@/server/runtime/briefing-service";
import { claimNextJob, completeRun, acceptApproval } from "@/server/runtime/runtime-service";
import {
  prepareSubscriptionBriefing,
  completeSubscriptionBriefing,
} from "@/server/runtime/subscription-service";
import { captureItem } from "@/server/items/item-service";
import { approvals, notes, subscriptionRequests, usageEntries } from "@/server/db/schema";
let h: TestDatabase;
const now = new Date("2026-09-09T12:00:00Z");
beforeAll(async () => {
  h = await createTestDatabase();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.truncate();
});
async function setup() {
  const profile = await createAiExecutionProfile(h.db, {
    key: "codex-profile",
    name: "Subscription",
    provider: "codex_chatgpt",
    model: "explicit-model",
    product: "codex_chatgpt",
    poolKey: null,
    enabled: true,
  });
  const job = await enqueueTodayBriefingAi(h.db, profile.id);
  const runtime = await registerMilesRuntime(h.db, "subscription-host");
  expect(
    await claimNextJob(
      h.db,
      {
        runtimeId: runtime.id,
        role: "miles",
        allowedJobKinds: ["today_briefing", "today_briefing_ai"],
      },
      now,
    ),
  ).toBeNull();
  const claim = await claimNextJob(
    h.db,
    { runtimeId: runtime.id, role: "miles", allowedJobKinds: ["today_briefing_codex"] },
    now,
  );
  return { job, runtime, run: claim!.run };
}
it("freezes context, rejects wrong execution paths, validates and creates one pending proposal", async () => {
  await captureItem(h.db, { text: "Synthetic worksheet", projectId: null });
  const { job, runtime, run } = await setup();
  const input = {
    judgment: {
      summary: "Review the worksheet.",
      priorities: ["Review synthetic worksheet"],
      needsTyler: [],
      watch: [],
    },
    usage: { inputTokens: 11, outputTokens: 7 },
  };
  await expect(completeSubscriptionBriefing(h.db, run.id, runtime.id, input, now)).rejects.toThrow(
    /Prepare/,
  );
  await expect(
    briefAiRun(
      h.db,
      run.id,
      runtime.id,
      async () => {
        throw Error("Must not call API");
      },
      now,
    ),
  ).rejects.toThrow(/Only an AI Today/);
  await expect(
    completeRun(
      h.db,
      run.id,
      runtime.id,
      {
        status: "succeeded",
        resultSummary: "bypass",
        proposal: { kind: "create_note", title: "Bad", body: "Raw worker prose" },
      },
      now,
    ),
  ).rejects.toThrow(/validates/);
  const prepared = await prepareSubscriptionBriefing(h.db, run.id, runtime.id, now);
  expect(prepared.status).toBe("prepared");
  await captureItem(h.db, { text: "Later context must not alter a retry", projectId: null });
  expect(await prepareSubscriptionBriefing(h.db, run.id, runtime.id, now)).toEqual(prepared);
  expect(await h.db.select().from(subscriptionRequests)).toHaveLength(1);
  const other = await registerMilesRuntime(h.db, "other-host");
  await expect(prepareSubscriptionBriefing(h.db, run.id, other.id, now)).rejects.toThrow(
    /different runtime/,
  );
  await expect(
    completeSubscriptionBriefing(
      h.db,
      run.id,
      runtime.id,
      { ...input, judgment: { ...input.judgment, summary: "x".repeat(401) } },
      now,
    ),
  ).rejects.toThrow();
  expect(await completeSubscriptionBriefing(h.db, run.id, runtime.id, input, now)).toEqual({
    jobStatus: "needs_approval",
  });
  expect(await prepareSubscriptionBriefing(h.db, run.id, runtime.id, now)).toEqual({
    status: "succeeded",
    jobStatus: "needs_approval",
  });
  await expect(prepareSubscriptionBriefing(h.db, run.id, other.id, now)).rejects.toThrow(
    /different runtime/,
  );
  expect(await h.db.select().from(usageEntries)).toHaveLength(1);
  expect(await h.db.select().from(notes)).toHaveLength(0);
  const pending = await h.db.select().from(approvals);
  expect(pending).toHaveLength(1);
  expect(pending[0]!.jobId).toBe(job.id);
  await expect(completeSubscriptionBriefing(h.db, run.id, runtime.id, input, now)).rejects.toThrow(
    /no longer the current claim/,
  );
  const usage = await h.db.select().from(usageEntries);
  expect(usage[0]).toMatchObject({
    provider: "openai",
    product: "codex_chatgpt",
    model: "explicit-model",
    inputTokens: 11,
    outputTokens: 7,
    estimatedCostUsd: null,
  });
  await acceptApproval(h.db, pending[0]!.id, now);
  expect(await h.db.select().from(notes)).toHaveLength(1);
  expect(await prepareSubscriptionBriefing(h.db, run.id, runtime.id, now)).toEqual({
    status: "succeeded",
    jobStatus: "succeeded",
  });
  expect(await h.db.select().from(approvals)).toHaveLength(1);
  expect(await h.db.select().from(usageEntries)).toHaveLength(1);
  expect(await h.db.select().from(notes)).toHaveLength(1);
});
it("completes an empty day without preparing any model input", async () => {
  const { runtime, run } = await setup();
  expect(await prepareSubscriptionBriefing(h.db, run.id, runtime.id, now)).toEqual({
    status: "succeeded",
  });
  expect(await h.db.select().from(subscriptionRequests)).toHaveLength(0);
  expect(await h.db.select().from(approvals)).toHaveLength(0);
});

it("does not acknowledge a failed attempt as completed", async () => {
  const { runtime, run } = await setup();
  await completeRun(
    h.db,
    run.id,
    runtime.id,
    {
      status: "failed",
      resultSummary: "Synthetic interruption",
    },
    now,
  );
  await expect(prepareSubscriptionBriefing(h.db, run.id, runtime.id, now)).rejects.toThrow(
    /no longer the current claim/,
  );
});
