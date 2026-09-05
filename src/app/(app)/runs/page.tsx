import { EnqueueAiBriefing } from "@/components/runtime/enqueue-ai-briefing";
import { EnqueueBriefingButton } from "@/components/runtime/enqueue-briefing-button";
import { JobBoard } from "@/components/runtime/job-board";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { getDb } from "@/server/db/client";
import { listEnabledAiExecutionProfiles } from "@/server/runtime/ai-profile-service";
import { listRuntimeBoard } from "@/server/runtime/runtime-service";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Runs" };

/**
 * Work TylerOS asked a role to do, and proposals waiting on Tyler.
 *
 * This is not a second inbox and not the Notion work board. Jobs are
 * executions; accepting a proposal writes a note through the ordinary
 * note service.
 */
export default async function RunsPage() {
  const db = getDb();
  const [rows, profiles] = await Promise.all([
    listRuntimeBoard(db),
    listEnabledAiExecutionProfiles(db),
  ]);

  const actions = (
    <div className="flex flex-col items-end gap-2">
      <EnqueueBriefingButton />
      <EnqueueAiBriefing profiles={profiles} />
    </div>
  );

  return (
    <>
      <PageHeader
        title="Runs"
        description="Ask Miles to brief Today. AI briefings need an explicit profile — nothing is routed automatically."
        action={actions}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing running"
          description="Ask Miles for a Today briefing. A runtime acting as Miles will pick it up and propose a note — nothing is written until you accept it."
          action={<EnqueueBriefingButton />}
        />
      ) : (
        <JobBoard rows={rows} />
      )}
    </>
  );
}
