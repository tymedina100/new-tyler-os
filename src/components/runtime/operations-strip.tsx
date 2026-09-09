import Link from "next/link";
import type { OperationsSummary } from "@/domain/runtime/operations-summary";
import { operationsHaveActivity } from "@/domain/runtime/operations-summary";

export function OperationsStrip({ summary }: { summary: OperationsSummary }) {
  if (!operationsHaveActivity(summary)) return null;
  return (
    <section aria-label="Miles operations" className="mb-6 rounded-lg border p-4">
      <h2 className="font-medium">Since yesterday</h2>
      <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
        {summary.savedNotes > 0 ? (
          <li>
            {summary.savedNotes} briefing {summary.savedNotes === 1 ? "note" : "notes"} saved after
            approval or standing authority.
          </li>
        ) : null}
        {summary.pendingApprovals > 0 ? (
          <li>
            {summary.pendingApprovals} {summary.pendingApprovals === 1 ? "proposal" : "proposals"}{" "}
            waiting for your decision, including older requests.
          </li>
        ) : null}
        {summary.failedJobs > 0 ? (
          <li>
            {summary.failedJobs} {summary.failedJobs === 1 ? "job" : "jobs"} failed in the last 24
            hours.
          </li>
        ) : null}
      </ul>
      <Link href="/runs" className="mt-3 inline-block text-sm underline underline-offset-4">
        Review Miles activity
      </Link>
    </section>
  );
}
