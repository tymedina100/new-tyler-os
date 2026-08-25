import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUS_LABELS, type ProjectWithProgress } from "@/domain/projects/project";

export function ProjectCard({ project }: { project: ProjectWithProgress }) {
  const { progress } = project;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="border-border bg-card hover:border-input grid content-start gap-2.5 rounded-xl border p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-medium break-words">{project.name}</h2>
        <Badge>{PROJECT_STATUS_LABELS[project.status]}</Badge>
      </div>

      {project.description ? (
        <p className="text-muted-foreground line-clamp-2 text-sm">{project.description}</p>
      ) : null}

      <ProgressBar percent={progress.percentComplete} />

      <p className="text-muted-foreground text-xs tabular-nums">
        {progress.total === 0
          ? "Nothing captured yet"
          : `${progress.completed} of ${progress.total} done · ${progress.open} open`}
      </p>
    </Link>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Project progress"
      className="bg-muted h-1 w-full overflow-hidden rounded-full"
    >
      <div
        className="bg-primary h-full rounded-full transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
