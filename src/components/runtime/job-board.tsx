import { ApprovalCard } from "@/components/runtime/approval-card";
import {
  AUTHORIZATION_LABELS,
  JOB_STATUS_LABELS,
  RUNTIME_KIND_LABELS,
  roleLabel,
  type Job,
  type Run,
  type RuntimeKind,
} from "@/domain/runtime/runtime";
import type { Approval } from "@/domain/runtime/runtime";

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
  }[];
}) {
  return (
    <ol className="grid gap-4">
      {rows.map((row) => (
        <li key={row.job.id} className="border-border bg-card grid gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{row.job.title}</p>
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
              {JOB_STATUS_LABELS[row.job.status]}
            </span>
          </div>

          {row.latestRun?.resultSummary ? (
            <p className="text-muted-foreground text-sm">{row.latestRun.resultSummary}</p>
          ) : null}

          {row.pendingApproval ? <ApprovalCard approval={row.pendingApproval} /> : null}
        </li>
      ))}
    </ol>
  );
}
