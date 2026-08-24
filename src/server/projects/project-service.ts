import type { Project, ProjectWithProgress } from "@/domain/projects/project";
import { computeProjectProgress } from "@/domain/projects/project";
import type { CreateProjectInput, UpdateProjectInput } from "@/domain/projects/project-schema";
import { DomainError, NotFoundError } from "@/domain/shared/errors";
import type { Database } from "@/server/db/client";
import { countItemsByProject } from "@/server/items/item-repository";
import * as repo from "@/server/projects/project-repository";

export async function listProjectsWithProgress(db: Database): Promise<ProjectWithProgress[]> {
  const [projects, counts] = await Promise.all([repo.listProjects(db), countItemsByProject(db)]);

  return projects.map((project) => {
    const count = counts.get(project.id) ?? { open: 0, completed: 0 };
    return { ...project, progress: computeProjectProgress(count.open, count.completed) };
  });
}

export async function getProject(db: Database, id: string): Promise<Project | null> {
  return repo.findProjectById(db, id);
}

export async function createProject(db: Database, input: CreateProjectInput): Promise<string> {
  try {
    return await repo.insertProject(db, input);
  } catch (error) {
    throw translateDuplicateName(error, input.name);
  }
}

export async function updateProject(db: Database, input: UpdateProjectInput): Promise<string> {
  try {
    const id = await repo.updateProjectRow(db, input.id, {
      name: input.name,
      description: input.description,
      status: input.status,
    });

    if (!id) throw new NotFoundError("Project", input.id);
    return id;
  } catch (error) {
    throw translateDuplicateName(error, input.name);
  }
}

export async function deleteProject(db: Database, id: string): Promise<void> {
  const deleted = await repo.deleteProjectRow(db, id);
  if (!deleted) throw new NotFoundError("Project", id);
}

/**
 * Project names are unique, case-insensitively. Two projects called "Kitchen"
 * would be indistinguishable in every picker in the app, so the database refuses
 * them and this turns the constraint violation into something readable.
 */
function translateDuplicateName(error: unknown, name: string): unknown {
  if (isUniqueViolation(error)) {
    return new DomainError("conflict", `A project named "${name}" already exists.`);
  }
  return error;
}

const UNIQUE_VIOLATION = "23505";

/** Drizzle wraps driver errors, so the Postgres code sits down the cause chain. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
