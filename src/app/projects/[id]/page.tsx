import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemList } from "@/components/items/item-list";
import { ItemSection } from "@/components/items/item-section";
import { ProgressBar } from "@/components/projects/project-card";
import { ProjectForm } from "@/components/projects/project-form";
import { CaptureBar } from "@/components/shell/capture-bar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { OPEN_ITEM_STATUSES } from "@/domain/items/item";
import { computeProjectProgress, PROJECT_STATUS_LABELS } from "@/domain/projects/project";
import { todayIsoDate } from "@/domain/shared/date";
import { getDb } from "@/server/db/client";
import { listItemsForView } from "@/server/items/item-service";
import { getProject } from "@/server/projects/project-service";

export async function generateMetadata(props: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const project = await getProject(getDb(), id);
  return { title: project ? project.name : "Project" };
}

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  const db = getDb();

  const project = await getProject(db, id);
  if (!project) notFound();

  const [openItems, doneItems] = await Promise.all([
    listItemsForView(db, { projectId: id, statuses: OPEN_ITEM_STATUSES }),
    listItemsForView(db, { projectId: id, statuses: ["done"] }),
  ]);

  const progress = computeProjectProgress(openItems.length, doneItems.length);
  const today = todayIsoDate(new Date());

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        action={<Badge>{PROJECT_STATUS_LABELS[project.status]}</Badge>}
      />

      <div className="mb-5 grid gap-1.5">
        <ProgressBar percent={progress.percentComplete} />
        <p className="text-muted-foreground text-xs tabular-nums">
          {progress.total === 0
            ? "Nothing captured yet"
            : `${progress.completed} of ${progress.total} done`}
        </p>
      </div>

      {/*
        Capturing here skips the inbox: the item already has a home, so making it
        wait for triage would be ceremony rather than help.
      */}
      <div className="mb-6">
        <CaptureBar projectId={project.id} placeholder={`Capture into ${project.name}…`} />
      </div>

      <div className="grid gap-6">
        {openItems.length === 0 && doneItems.length === 0 ? (
          <EmptyState
            title="No items yet"
            description="Capture the first thing this project needs using the box above."
          />
        ) : null}

        {openItems.length > 0 ? (
          <ItemSection title="Open" count={openItems.length}>
            <ItemList items={openItems} today={today} />
          </ItemSection>
        ) : null}

        {doneItems.length > 0 ? (
          <details className="grid gap-2">
            <summary className="text-muted-foreground cursor-pointer text-[0.6875rem] font-semibold tracking-[0.08em] uppercase select-none">
              Done · {doneItems.length}
            </summary>
            <div className="mt-2">
              <ItemList items={doneItems} today={today} />
            </div>
          </details>
        ) : null}

        <details className="border-border bg-card rounded-xl border">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">
            Project settings
          </summary>
          <div className="border-border border-t p-4">
            <ProjectForm project={project} />
          </div>
        </details>
      </div>
    </>
  );
}
