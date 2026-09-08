import { DomainError } from "@/domain/shared/errors";
import { assertCurrentAttempt } from "@/domain/runtime/recovery-rules";
import { ledgerUsage } from "@/domain/runtime/usage-rules";
import type { JobStatus } from "@/domain/runtime/runtime";
import type { CompleteRunInput, CreateNoteProposalInput } from "@/domain/runtime/runtime-schema";
import { completeRunSchema } from "@/domain/runtime/runtime-schema";
import {
  completeRunningJob,
  emptyUsage,
  finishRun,
  proposedNoteCaptureBody,
  resolveUnderStandingAuthority,
} from "@/domain/runtime/runtime-rules";
import type { StandingAuthority } from "@/domain/runtime/standing-authority";
import type { Database } from "@/server/db/client";
import { captureNote } from "@/server/notes/note-service";
import * as capacityRepo from "./capacity-repository";
import { assertRunOwnedBy, requireJob, requireRun, requireRuntime } from "./runtime-lookups";
import * as repo from "./runtime-repository";
import { findMatchingStandingAuthority } from "./standing-authority-service";

/**
 * Finish a run. A proposal waits on Tyler unless standing authority matches;
 * auto-execution still creates the note through `noteService.captureNote`.
 */

export async function completeRun(
  db: Database,
  runId: string,
  runtimeId: string,
  input: CompleteRunInput,
  now = new Date(),
): Promise<{ jobStatus: JobStatus }> {
  const parsed = completeRunSchema.parse(input);
  return db.transaction(async (tx) => {
    const runtime = await requireRuntime(tx, runtimeId);
    const run = await requireRun(tx, runId);
    assertRunOwnedBy(run, runtime.id);
    const job = await requireJob(tx, run.jobId);
    assertCurrentAttempt(job, run);

    const outcome = parsed.status;
    const proposal = outcome === "succeeded" ? parsed.proposal : undefined;
    const matched = proposal
      ? await findMatchingStandingAuthority(tx, {
          role: job.assignedRole,
          jobKind: job.kind,
          action: proposal.kind,
        })
      : null;

    const usage = ledgerUsage(parsed.usage ?? emptyUsage());
    const jobPatch = completeRunningJob(
      job,
      run,
      outcome,
      proposal !== undefined,
      matched !== null,
    );
    const runPatch = finishRun(run, outcome, now, parsed.resultSummary, usage);

    await repo.updateRun(tx, run.id, runPatch);
    await repo.updateJob(tx, job.id, { status: jobPatch.jobStatus });
    await capacityRepo.insertUsageEntry(tx, {
      runId: run.id,
      runtimeId: runtime.id,
      provider: usage.provider,
      product: parsed.usage?.product ?? null,
      poolKey: parsed.usage?.poolKey ?? null,
      model: usage.model,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      recordedAt: now,
    });
    await repo.touchRuntimeLastSeen(tx, runtime.id, now);

    if (proposal) {
      await applyCreateNoteProposal(tx, {
        runId: run.id,
        jobId: job.id,
        proposal,
        matched,
        now,
      });
    }

    return { jobStatus: jobPatch.jobStatus };
  });
}

async function applyCreateNoteProposal(
  db: Database,
  input: {
    runId: string;
    jobId: string;
    proposal: CreateNoteProposalInput;
    matched: StandingAuthority | null;
    now: Date;
  },
): Promise<void> {
  const approval = await repo.insertApproval(db, {
    runId: input.runId,
    jobId: input.jobId,
    kind: input.proposal.kind,
    title: input.proposal.title,
    body: input.proposal.body,
  });

  if (input.matched === null) return;

  const owned = await repo.takePendingApproval(db, approval.id, {
    ...resolveUnderStandingAuthority(approval, input.now),
    standingAuthorityId: input.matched.id,
    standingAuthorityKey: input.matched.key,
  });
  if (owned === null) {
    throw new DomainError("conflict", "This proposal has already been resolved.");
  }

  const body = proposedNoteCaptureBody(approval.title, approval.body);
  const noteId = await captureNote(db, { body, projectId: null });
  await repo.updateApproval(db, approval.id, { acceptedNoteId: noteId });
}
