import { z } from "zod";
import { MAX_NOTE_BODY_LENGTH, MAX_NOTE_TITLE_LENGTH } from "@/domain/notes/note";
import {
  APPROVAL_KINDS,
  JOB_KINDS,
  MAX_APPROVAL_BODY_LENGTH,
  MAX_RESULT_SUMMARY_LENGTH,
  ROLES,
  RUN_TRIGGERS,
  RUNTIME_KINDS,
  type ApprovalKind,
  type JobKind,
  type Role,
  type RunTrigger,
  type RuntimeKind,
} from "./runtime";

/**
 * Validation for the runtime control plane.
 *
 * Human actions send form fields. The machine API sends JSON. Both land on
 * the same schemas so a runtime cannot invent a job kind a form could not.
 */

export const roleSchema = z.enum(ROLES);
export const runtimeKindSchema = z.enum(RUNTIME_KINDS);
export const jobKindSchema = z.enum(JOB_KINDS);
export const approvalKindSchema = z.enum(APPROVAL_KINDS);
export const runTriggerSchema = z.enum(RUN_TRIGGERS);

export const runtimeIdSchema = z.object({ id: z.uuid() });

const optionalBoundedText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length === 0 ? null : trimmed;
    });

const optionalTokenCount = z
  .number()
  .int()
  .nonnegative()
  .max(100_000_000)
  .nullish()
  .transform((value) => value ?? null);

const optionalCost = z
  .number()
  .nonnegative()
  .max(1_000_000)
  .nullish()
  .transform((value) => value ?? null);

/**
 * Optional usage telemetry on a completed run.
 *
 * Present so a later per-role, per-provider capacity ledger can be filled
 * without changing the job protocol. Slice 1 stores the fields and does
 * nothing else with them — no reservations, no routing.
 */
export const runUsageSchema = z.object({
  provider: optionalBoundedText(80),
  model: optionalBoundedText(120),
  inputTokens: optionalTokenCount,
  cachedInputTokens: optionalTokenCount,
  outputTokens: optionalTokenCount,
  estimatedCostUsd: optionalCost,
});
export type RunUsageInput = z.infer<typeof runUsageSchema>;

export const createNoteProposalSchema = z.object({
  kind: z.literal("create_note" satisfies ApprovalKind),
  title: z.string().trim().min(1, "A proposed note needs a title.").max(MAX_NOTE_TITLE_LENGTH),
  body: z.string().min(1, "A proposed note needs some content.").max(MAX_APPROVAL_BODY_LENGTH),
});
export type CreateNoteProposalInput = z.infer<typeof createNoteProposalSchema>;

export const completeRunSchema = z.object({
  status: z.enum(["succeeded", "failed"]),
  resultSummary: optionalBoundedText(MAX_RESULT_SUMMARY_LENGTH),
  proposal: createNoteProposalSchema.optional(),
  usage: runUsageSchema.optional(),
});
export type CompleteRunInput = z.infer<typeof completeRunSchema>;

export const claimIdentitySchema = z.object({
  runtimeKind: runtimeKindSchema,
  role: roleSchema,
});
export type ClaimIdentity = z.infer<typeof claimIdentitySchema>;

export const enqueueTodayBriefingSchema = z.object({
  kind: z.literal("today_briefing" satisfies JobKind).optional(),
  trigger: runTriggerSchema.optional(),
});

export const approvalIdSchema = z.object({ id: z.uuid() });

export const heartbeatSchema = z.object({}).strict();

export function defaultTrigger(value: RunTrigger | undefined): RunTrigger {
  return value ?? "manual";
}

export function defaultJobKind(value: JobKind | undefined): JobKind {
  return value ?? "today_briefing";
}

export function defaultRole(value: Role | undefined): Role {
  return value ?? "miles";
}

export function defaultRuntimeKind(value: RuntimeKind | undefined): RuntimeKind {
  return value ?? "python";
}

export function proposedNoteTitle(title: string): string {
  return title.trim().slice(0, MAX_NOTE_TITLE_LENGTH);
}

export function proposedNoteBody(body: string): string {
  return body.slice(0, MAX_NOTE_BODY_LENGTH);
}
