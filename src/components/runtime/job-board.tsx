import { ApprovalCard } from "@/components/runtime/approval-card";
import {
  APPROVAL_STATUS_LABELS,
  AUTHORIZATION_LABELS,
  JOB_KIND_LABELS,
  JOB_STATUS_LABELS,
  RUNTIME_KIND_LABELS,
  roleLabel,
  type Approval,
  type Job,
  type JobKind,
  type Run,
  type RuntimeKind,
} from "@/domain/runtime/runtime";

export function JobBoard({
  rows,
}: {
  rows: readonly {
    job: Job;
    claimedRuntimeKind: RuntimeKind | null;
    claimedRuntimeName?: string | null;
    claimedRuntimeInstanceKey?: string | null;
    latestRun: Run | null;
    pendingApproval: Approval | null;
    latestApproval: Approval | null;
  }[];
}) {
  return (
    <ol className="grid gap-4">
      {rows.map((row) => (
        <li key={row.job.id} className="border-border bg-card grid gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {row.job.kind === "today_briefing_ai"
                  ? JOB_KIND_LABELS.today_briefing_ai
                  : row.job.title}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {roleLabel(row.job.assignedRole)} · {AUTHORIZATION_LABELS[row.job.authorization]}
                {row.claimedRuntimeName
                  ? ` · ${row.claimedRuntimeName}`
                  : row.claimedRuntimeKind
                    ? ` · ${RUNTIME_KIND_LABELS[row.claimedRuntimeKind]}`
                    : row.job.requestedRuntimeKind
                      ? ` · pinned to ${RUNTIME_KIND_LABELS[row.job.requestedRuntimeKind]}`
                      : " · any runtime"}
                {row.job.scheduleId
                  ? " · Scheduled"
                  : row.latestRun?.trigger === "schedule"
                    ? " · Scheduled"
                    : ""}
              </p>
            </div>
            <span className="text-muted-foreground text-xs font-medium">
              {row.latestApproval?.status === "auto_executed"
                ? "Completed"
                : JOB_STATUS_LABELS[row.job.status]}
            </span>
          </div>

          {row.latestRun?.resultSummary ? (
            <p className="text-muted-foreground text-sm">{row.latestRun.resultSummary}</p>
          ) : null}

          <RunTelemetry jobKind={row.job.kind} run={row.latestRun} />

          {row.pendingApproval ? <ApprovalCard approval={row.pendingApproval} /> : null}
          {row.latestApproval?.status === "auto_executed" ? (
            <StandingAuthorityAudit approval={row.latestApproval} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function StandingAuthorityAudit({ approval }: { approval: Approval }) {
  return (
    <div className="border-border/70 grid gap-1 rounded-lg border p-3">
      <p className="text-sm font-medium">{APPROVAL_STATUS_LABELS.auto_executed}</p>
      {approval.standingAuthorityKey ? (
        <p className="text-muted-foreground text-xs">{approval.standingAuthorityKey}</p>
      ) : null}
    </div>
  );
}

function RunTelemetry({ jobKind, run }: { jobKind: JobKind; run: Run | null }) {
  if (!run) return null;

  const facts = [
    run.provider && run.provider !== "none" ? titleCase(run.provider) : null,
    run.model && run.model !== "deterministic" ? run.model : null,
    tokenLine(run),
    jobKind === "today_briefing_ai" && run.status === "running" ? "Calling provider" : null,
  ].filter((value): value is string => value !== null);

  if (facts.length === 0) return null;

  return <p className="text-muted-foreground text-xs">{facts.join(" · ")}</p>;
}

function tokenLine(run: Run): string | null {
  if (run.inputTokens === null && run.outputTokens === null) return null;
  if (run.provider === "none" || run.model === "deterministic") return null;
  const input = (run.inputTokens ?? 0).toLocaleString("en-US");
  const output = (run.outputTokens ?? 0).toLocaleString("en-US");
  return `${input} input / ${output} output`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
