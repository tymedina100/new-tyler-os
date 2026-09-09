import { z } from "zod";
import { findCapacityPoolById } from "./capacity-repository";
import { assertCurrentAttempt } from "@/domain/runtime/recovery-rules";
import type { Database } from "@/server/db/client";
import { DomainError } from "@/domain/shared/errors";
import { milesJudgmentSchema, renderMilesBriefing } from "@/domain/runtime/briefing-judgment";
import { runUsageSchema } from "@/domain/runtime/runtime-schema";
import { todayHasMaterial } from "@/domain/runtime/today-context";
import { MILES_BRIEFING_SYSTEM_PROMPT, buildBriefingPrompt } from "@/server/ai/brief-today";
import { requireRun, requireJob, assertRunOwnedBy } from "./runtime-lookups";
import { findAiExecutionProfileById } from "./ai-profile-repository";
import { claimAiRequest } from "./runtime-repository";
import { findSubscriptionRequest, insertSubscriptionRequest } from "./subscription-repository";
import { completeRun, completeValidatedAiRun, getTodayContext } from "./runtime-service";

async function requireSubscriptionRun(db: Database, runId: string, runtimeId: string) {
  const run = await requireRun(db, runId);
  assertRunOwnedBy(run, runtimeId);
  const job = await requireJob(db, run.jobId);
  assertCurrentAttempt(job, run);
  if (job.kind !== "today_briefing_codex" || job.status !== "running" || run.status !== "running")
    throw new DomainError("invalid_transition", "A running subscription briefing is required.");
  const profile = job.aiExecutionProfileId
    ? await findAiExecutionProfileById(db, job.aiExecutionProfileId)
    : null;
  if (!profile?.enabled || profile.provider !== "codex_chatgpt")
    throw new DomainError(
      "invalid_transition",
      "An enabled Codex subscription profile is required.",
    );
  return profile;
}

export async function prepareSubscriptionBriefing(
  db: Database,
  runId: string,
  runtimeId: string,
  now = new Date(),
) {
  const profile = await requireSubscriptionRun(db, runId, runtimeId);
  const saved = await findSubscriptionRequest(db, runId);
  if (saved) return { status: "prepared" as const, request: saved };
  const context = await getTodayContext(db, now);
  if (!todayHasMaterial(context)) {
    await completeRun(
      db,
      runId,
      runtimeId,
      {
        status: "succeeded",
        resultSummary: "No material Today items.",
        usage: { provider: "none", model: "deterministic" },
      },
      now,
    );
    return { status: "succeeded" as const };
  }
  const request = await db.transaction(async (tx) => {
    const claimed = await claimAiRequest(tx, runId, runtimeId, now);
    if (!claimed) {
      const existing = await findSubscriptionRequest(tx, runId);
      if (existing) return existing;
      throw new DomainError("conflict", "Subscription preparation is already in progress.");
    }
    return insertSubscriptionRequest(tx, {
      runId,
      model: profile.model,
      effort: "low",
      today: context.today,
      prompt: `${MILES_BRIEFING_SYSTEM_PROMPT}\n\n${buildBriefingPrompt(context)}`,
    });
  });
  return { status: "prepared" as const, request };
}

export const subscriptionCompletionSchema = z
  .object({ judgment: milesJudgmentSchema, usage: runUsageSchema })
  .strict();
export async function completeSubscriptionBriefing(
  db: Database,
  runId: string,
  runtimeId: string,
  input: z.input<typeof subscriptionCompletionSchema>,
  now = new Date(),
) {
  const profile = await requireSubscriptionRun(db, runId, runtimeId);
  const pool = profile.capacityPoolId
    ? await findCapacityPoolById(db, profile.capacityPoolId)
    : null;
  const saved = await findSubscriptionRequest(db, runId);
  if (!saved)
    throw new DomainError(
      "invalid_transition",
      "Prepare this subscription attempt before completion.",
    );
  const parsed = subscriptionCompletionSchema.parse(input);
  const proposal = renderMilesBriefing(saved.today, parsed.judgment);
  return completeValidatedAiRun(
    db,
    runId,
    runtimeId,
    {
      status: "succeeded",
      resultSummary: "Drafted subscription Today briefing.",
      proposal: { kind: "create_note", ...proposal },
      usage: {
        ...parsed.usage,
        provider: "openai",
        product: "codex_chatgpt",
        poolKey: pool?.poolKey ?? null,
        model: saved.model,
        estimatedCostUsd: null,
      },
    },
    now,
  );
}
