/**
 * Projects group work that belongs together: a home renovation, a coding
 * project, a trip. They are containers, not a taxonomy — an item belongs to at
 * most one project, and nesting is deliberately not supported.
 */

export const PROJECT_STATUSES = ["active", "paused", "done", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
  archived: "Archived",
};

export interface ProjectProgress {
  total: number;
  completed: number;
  open: number;
  percentComplete: number;
}

export interface ProjectWithProgress extends Project {
  progress: ProjectProgress;
}

/**
 * Progress counts every item in the project, not only tasks. A project's notes
 * and ideas are part of its weight even when nothing is checkable.
 */
export function computeProjectProgress(open: number, completed: number): ProjectProgress {
  const total = open + completed;
  return {
    total,
    completed,
    open,
    percentComplete: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
