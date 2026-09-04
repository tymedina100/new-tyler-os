import type { Metadata } from "next";
import { EnqueueBriefingButton } from "@/components/runtime/enqueue-briefing-button";
import { JobBoard } from "@/components/runtime/job-board";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { getDb } from "@/server/db/client";
import { listRuntimeBoard } from "@/server/runtime/runtime-service";

export const metadata: Metadata = { title: "Runs" };

/**
 * Work TylerOS asked a role to do, and proposals waiting on Tyler.
 *
 * This is not a second inbox and not the Notion work board. Jobs are
 * executions; accepting a proposal writes a note through the ordinary
 * note service.
 */
export default async function RunsPage() {
  const rows = await listRuntimeBoard(getDb());

  return (
    <>
      <PageHeader
        title="Runs"
        description="Ask Miles to brief Today. Proposals wait here until you accept them as notes."
        action={<EnqueueBriefingButton />}
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
