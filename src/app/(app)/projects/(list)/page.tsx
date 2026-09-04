import type { Metadata } from "next";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { getDb } from "@/server/db/client";
import { listProjectsWithProgress } from "@/server/projects/project-service";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const projects = await listProjectsWithProgress(getDb());

  return (
    <>
      <PageHeader
        title="Projects"
        description="Collections of related work. An item belongs to at most one."
      />

      <details className="border-border bg-card mb-5 rounded-xl border">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">
          New project
        </summary>
        <div className="border-border border-t p-4">
          <ProjectForm />
        </div>
      </details>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create one when a handful of captured items clearly belong together. Projects are for work with a shape, not for filing everything."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </>
  );
}
