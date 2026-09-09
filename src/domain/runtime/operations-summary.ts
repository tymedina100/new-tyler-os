/** Counts of canonical outcomes. No proposal bodies or runtime-reported prose. */
export interface OperationsSummary {
  since: string;
  asOf: string;
  pendingApprovals: number;
  failedJobs: number;
  savedNotes: number;
}

export function operationsNeedAttention(summary: OperationsSummary): boolean {
  return summary.pendingApprovals > 0 || summary.failedJobs > 0;
}

export function operationsHaveActivity(summary: OperationsSummary): boolean {
  return operationsNeedAttention(summary) || summary.savedNotes > 0;
}
