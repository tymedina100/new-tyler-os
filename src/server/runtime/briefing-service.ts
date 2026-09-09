import { DomainError, NotFoundError } from "@/domain/shared/errors";
import {
  assertAiProfileEnabled,
  assertExplicitAiProfileId,
} from "@/domain/runtime/ai-profile-rules";
import { parseMilesJudgment, renderMilesBriefing } from "@/domain/runtime/briefing-judgment";
import {
  CHIEF_OF_STAFF_ROLE,
  TODAY_BRIEFING_AI_INSTRUCTION,
  TODAY_BRIEFING_AI_TITLE,
  type Job,
  type RunUsage,
} from "@/domain/runtime/runtime";
import { todayHasMaterial } from "@/domain/runtime/today-context";
import type { Database } from "@/server/db/client";
import {
  briefToday,
  buildBriefingPrompt,
  MILES_BRIEFING_SYSTEM_PROMPT,
  type TodayBriefingCaller,
} from "@/server/ai/brief-today";
import * as capacityRepo from "./capacity-repository";
import * as profileRepo from "./ai-profile-repository";
import * as runtimeRepo from "./runtime-repository";
import { completeRun, completeValidatedAiRun, getTodayContext } from "./runtime-service";

/**
 * Manual Miles AI briefing. Tyler picks the profile. One provider request
 * per run. Empty Today never spends a token.
 */

export async function enqueueTodayBriefingAi(db: Database, profileId: string): Promise<Job> {
  assertExplicitAiProfileId(profileId);
  const profile = await profileRepo.findAiExecutionProfileById(db, profileId);
  if (profile === null) throw new NotFoundError("AI execution profile", profileId);
  assertAiProfileEnabled(profile);

  return runtimeRepo.insertJob(db, {
    kind: profile.provider === "codex_chatgpt" ? "today_briefing_codex" : "today_briefing_ai",
    title:
      profile.provider === "codex_chatgpt"
        ? "Subscription Today briefing"
        : TODAY_BRIEFING_AI_TITLE,
    instruction:
      profile.provider === "codex_chatgpt"
        ? "Prepare frozen Today context, run the selected Codex ChatGPT subscription profile once, and submit structured Miles judgment for server validation and note approval. Empty days complete without inference."
        : TODAY_BRIEFING_AI_INSTRUCTION,
    authorization: "observe",
    assignedRole: CHIEF_OF_STAFF_ROLE,
    aiExecutionProfileId: profile.id,
  });
}

export async function briefAiRun(
  db: Database,
  runId: string,
  runtimeId: string,
  caller: TodayBriefingCaller = briefToday,
  now = new Date(),
): Promise<{ status: "succeeded" | "failed" | "needs_approval" }> {
  const run = await requireRun(db, runId);
  if (run.runtimeId !== runtimeId) {
    throw new DomainError("invalid_transition", "This attempt belongs to a different runtime.");
  }

  const job = await requireJob(db, run.jobId);
  if (job.kind !== "today_briefing_ai") {
    throw new DomainError("invalid_transition", "Only an AI Today briefing can request a model.");
  }
  if (job.status !== "running" || run.status !== "running") {
    throw new DomainError("invalid_transition", "Only a running AI briefing can request a model.");
  }

  const claimed = await runtimeRepo.claimAiRequest(db, run.id, runtimeId, now);
  if (claimed === null) {
    throw new DomainError("invalid_transition", "This run's AI request has already started.");
  }

  const profile = await loadProfileOrFail(db, job, claimed, runtimeId, now);
  if (!profile) return { status: "failed" };

  const context = await getTodayContext(db, now);
  if (!todayHasMaterial(context)) {
    await completeRun(
      db,
      run.id,
      runtimeId,
      {
        status: "succeeded",
        resultSummary: "No material Today items.",
        usage: { provider: "none", model: "deterministic" },
      },
      now,
    );
    return { status: "succeeded" };
  }

  const result = await caller({
    model: profile.model,
    system: MILES_BRIEFING_SYSTEM_PROMPT,
    prompt: buildBriefingPrompt(context),
  });

  const poolKey = await poolKeyFor(db, profile.capacityPoolId);
  const usage = usageFrom(
    profile.provider,
    result.ok ? result.model : profile.model,
    result.usage,
    {
      product: profile.product,
      poolKey,
    },
  );

  if (!result.ok) {
    await completeRun(
      db,
      run.id,
      runtimeId,
      {
        status: "failed",
        resultSummary: failSummary(result.failure),
        usage,
      },
      now,
    );
    return { status: "failed" };
  }

  const judgment = parseMilesJudgment(result.text);
  if (judgment === null) {
    await completeRun(
      db,
      run.id,
      runtimeId,
      {
        status: "failed",
        resultSummary: "The model returned invalid structured output.",
        usage,
      },
      now,
    );
    return { status: "failed" };
  }

  const proposal = renderMilesBriefing(context.today, judgment);
  const completed = await completeValidatedAiRun(
    db,
    run.id,
    runtimeId,
    {
      status: "succeeded",
      resultSummary: "Drafted today's AI briefing.",
      proposal: { kind: "create_note", title: proposal.title, body: proposal.body },
      usage,
    },
    now,
  );
  return {
    status: completed.jobStatus === "needs_approval" ? "needs_approval" : "succeeded",
  };
}

async function loadProfileOrFail(
  db: Database,
  job: Job,
  run: { id: string },
  runtimeId: string,
  now: Date,
) {
  if (!job.aiExecutionProfileId) {
    await completeRun(
      db,
      run.id,
      runtimeId,
      {
        status: "failed",
        resultSummary: "This AI briefing has no execution profile.",
        usage: { provider: "none", model: "deterministic" },
      },
      now,
    );
    return null;
  }

  const profile = await profileRepo.findAiExecutionProfileById(db, job.aiExecutionProfileId);
  if (profile === null) {
    await completeRun(
      db,
      run.id,
      runtimeId,
      {
        status: "failed",
        resultSummary: "The selected AI execution profile is missing.",
        usage: { provider: "none", model: "deterministic" },
      },
      now,
    );
    return null;
  }

  if (!profile.enabled) {
    await completeRun(
      db,
      run.id,
      runtimeId,
      {
        status: "failed",
        resultSummary: `AI execution profile ${profile.key} is disabled.`,
        usage: { provider: "none", model: "deterministic" },
      },
      now,
    );
    return null;
  }

  return profile;
}

async function poolKeyFor(db: Database, capacityPoolId: string | null): Promise<string | null> {
  if (!capacityPoolId) return null;
  const pool = await capacityRepo.findCapacityPoolById(db, capacityPoolId);
  return pool?.poolKey ?? null;
}

function usageFrom(
  provider: string,
  model: string,
  tokens:
    | RunUsage
    | { inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null }
    | null,
  attribution: { product: string | null; poolKey: string | null },
) {
  return {
    provider,
    model,
    product: attribution.product,
    poolKey: attribution.poolKey,
    inputTokens: tokens?.inputTokens ?? null,
    cachedInputTokens: tokens?.cachedInputTokens ?? null,
    outputTokens: tokens?.outputTokens ?? null,
    estimatedCostUsd: null,
  };
}

function failSummary(failure: string): string {
  if (failure === "not_configured") return "ANTHROPIC_API_KEY is not set on the TylerOS runtime.";
  if (failure === "unauthorized") return "The provider rejected the API credential.";
  if (failure === "timeout") return "The provider timed out.";
  if (failure === "client_error") return "The provider rejected the request.";
  if (failure === "rate_limited") return "The provider rate-limited the request.";
  if (failure === "server_error") return "The provider returned a server error.";
  if (failure === "network") return "The provider could not be reached.";
  return `The provider failed (${failure}).`;
}

async function requireRun(db: Database, id: string) {
  const run = await runtimeRepo.findRunById(db, id);
  if (run === null) throw new NotFoundError("Run", id);
  return run;
}

async function requireJob(db: Database, id: string) {
  const job = await runtimeRepo.findJobById(db, id);
  if (job === null) throw new NotFoundError("Job", id);
  return job;
}
