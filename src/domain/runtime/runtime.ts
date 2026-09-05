/**
 * Runtime control plane: roles, runtimes, jobs, runs, approvals.
 *
 * This is a structured domain of its own, for the same reason notes and the
 * kitchen are. A job is an *execution*, not something captured to act on —
 * putting it on `items` would mix "take the bins out" with "Miles is drafting
 * a briefing." Personal life stays on the spine. Shared work (projects, tasks,
 * blockers, decisions) stays in Notion. This table family records work a
 * *runtime* was asked to do on behalf of a *role*. See ADR 035.
 *
 * Two different things, on purpose:
 *
 *   - A **role** is a durable member of the TylerOS org (Miles, Forge, …).
 *     Jobs are assigned to roles. The hierarchy does not change when a
 *     provider is swapped.
 *   - A **runtime** is an execution *instance* (Home Desktop Python, a laptop
 *     backup worker, Grok Bot). Kind is python/cursor/… — not Miles. Many
 *     instances may share a kind. Miles-on-Grok and Miles-on-Python are the
 *     same role.
 *
 * Slice 1 proves the seam with one Miles observe job. The other roles and
 * runtime kinds are named now so adding them later is a row, not a protocol
 * change. Naming them is not a specialist framework and not a job queue
 * replacing the org chart.
 */

/** Durable TylerOS org. Miles coordinates; each specialist owns one domain. */
export const ROLES = [
  "miles",
  "forge",
  "archer",
  "mercury",
  "atlas",
  "scout",
  "ledger",
  "rally",
  "palate",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_TITLES: Record<Role, string> = {
  miles: "Chief of Staff",
  forge: "Projects & builds",
  archer: "Career",
  mercury: "Commerce",
  atlas: "Home & life",
  scout: "Research",
  ledger: "Finance",
  rally: "Sports",
  palate: "Food & drink",
};

/** Execution backends. Never the same enum as `ROLES`. */
export const RUNTIME_KINDS = [
  "python",
  "grok_bot",
  "cursor",
  "chatgpt",
  "claude",
  "gemini",
  "api",
] as const;
export type RuntimeKind = (typeof RUNTIME_KINDS)[number];

export const RUNTIME_STATUSES = ["enabled", "disabled"] as const;
export type RuntimeStatus = (typeof RUNTIME_STATUSES)[number];

export const RUNTIME_KIND_LABELS: Record<RuntimeKind, string> = {
  python: "Python worker",
  grok_bot: "Grok Bot",
  cursor: "Cursor",
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  api: "Official API",
};

export const JOB_KINDS = ["today_briefing", "today_briefing_ai"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/**
 * Where a job stands.
 *
 * `running` means a runtime has claimed it on behalf of the assigned role.
 * The claim is `claimed_by_runtime_id` plus this status.
 */
export const JOB_STATUSES = [
  "queued",
  "running",
  "needs_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Ceiling on side effects. A ceiling is not a grant: `observe` may read and
 * propose; it may not write personal state.
 */
export const AUTHORIZATION_LEVELS = [
  "observe",
  "propose",
  "modify_local",
  "external_action",
] as const;
export type AuthorizationLevel = (typeof AUTHORIZATION_LEVELS)[number];

export const RUN_STATUSES = ["running", "succeeded", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_TRIGGERS = ["manual", "schedule", "api"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const APPROVAL_KINDS = ["create_note"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const APPROVAL_STATUSES = ["pending", "accepted", "dismissed", "superseded"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const CHIEF_OF_STAFF_ROLE: Role = "miles";
export const SLICE_RUNTIME_KIND: RuntimeKind = "python";

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  today_briefing: "Today briefing",
  today_briefing_ai: "AI Today briefing",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  needs_approval: "Needs approval",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const AUTHORIZATION_LABELS: Record<AuthorizationLevel, string> = {
  observe: "Observe",
  propose: "Propose",
  modify_local: "Modify local",
  external_action: "External action",
};

export const APPROVAL_KIND_LABELS: Record<ApprovalKind, string> = {
  create_note: "Create note",
};

export const TODAY_BRIEFING_TITLE = "Today briefing";

export const TODAY_BRIEFING_INSTRUCTION =
  "Read Today's open items and food that is expiring soon. Write a short markdown briefing as Miles. Propose it as a note — do not create the note yourself.";

export const TODAY_BRIEFING_AI_TITLE = "AI Today briefing";

export const TODAY_BRIEFING_AI_INSTRUCTION =
  "Read Today's open items and food that is expiring soon. If Today is empty, complete quietly with no proposal and no model call. If Today has material, ask TylerOS to run the selected AI execution profile once and propose the structured briefing as a note — do not create the note yourself.";

export const MAX_RESULT_SUMMARY_LENGTH = 500;
export const MAX_JOB_INSTRUCTION_LENGTH = 4_000;
export const MAX_APPROVAL_TITLE_LENGTH = 200;
export const MAX_APPROVAL_BODY_LENGTH = 50_000;

export interface Runtime {
  id: string;
  /** Stable machine-facing id, e.g. `home-desktop-python`. Unique. */
  instanceKey: string;
  name: string;
  kind: RuntimeKind;
  status: RuntimeStatus;
  lastSeenAt: Date | null;
  /** Optional node label, e.g. a hostname. Not an org role. */
  deviceId: string | null;
  createdAt: Date;
}

export interface Job {
  id: string;
  kind: JobKind;
  title: string;
  instruction: string;
  status: JobStatus;
  authorization: AuthorizationLevel;
  /** Who owns this work in the org. Not which model will run it. */
  assignedRole: Role;
  /** Optional pin to one backend. Null means any runtime acting as the role. */
  requestedRuntimeKind: RuntimeKind | null;
  /**
   * Explicit AI execution profile for `today_briefing_ai`. Null on the
   * deterministic briefing — a profile is never inferred.
   */
  aiExecutionProfileId: string | null;
  /** Null on a manual Ask Miles job. Set when a schedule created this row. */
  scheduleId: string | null;
  /** Local calendar date the schedule fired for. Null on manual jobs. */
  scheduledForDate: string | null;
  /** Claims so far, including the current one. Recovery stops at 3. */
  attemptCount: number;
  claimedByRuntimeId: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunUsage {
  /** Runtime-reported. TylerOS does not choose a model in this slice. */
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
}

export interface Run extends RunUsage {
  id: string;
  jobId: string;
  runtimeId: string;
  /** Role this attempt acted as — denormalised so later quota is per-role. */
  role: Role;
  status: RunStatus;
  trigger: RunTrigger;
  resultSummary: string | null;
  lastHeartbeatAt: Date | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface Approval {
  id: string;
  runId: string;
  jobId: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  title: string;
  body: string;
  acceptedNoteId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isRuntimeKind(value: string): value is RuntimeKind {
  return (RUNTIME_KINDS as readonly string[]).includes(value);
}

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function isRunStatus(value: string): value is RunStatus {
  return (RUN_STATUSES as readonly string[]).includes(value);
}

export function isApprovalKind(value: string): value is ApprovalKind {
  return (APPROVAL_KINDS as readonly string[]).includes(value);
}

export function roleLabel(role: Role): string {
  return `${titleCase(role)} · ${ROLE_TITLES[role]}`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
