import { asc, eq, sql } from "drizzle-orm";
import type { Project } from "@/domain/projects/project";
import type { Database } from "@/server/db/client";
import { type NewProjectRow, projects } from "@/server/db/schema";

export async function findProjectById(db: Database, id: string): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

/**
 * Ordered so the projects you are working on sit at the top, then paused, then
 * finished, then archived - the order a person reads their own life in.
 */
export async function listProjects(db: Database): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .orderBy(
      asc(sql`array_position(array['active', 'paused', 'done', 'archived'], ${projects.status}::text)`),
      asc(sql`lower(${projects.name})`),
    );
}

export async function insertProject(db: Database, values: NewProjectRow): Promise<string> {
  const [row] = await db.insert(projects).values(values).returning({ id: projects.id });

  if (!row) throw new Error("Insert returned no project id.");
  return row.id;
}

export async function updateProjectRow(
  db: Database,
  id: string,
  patch: Partial<NewProjectRow>,
): Promise<string | null> {
  const [row] = await db
    .update(projects)
    .set(patch)
    .where(eq(projects.id, id))
    .returning({ id: projects.id });

  return row?.id ?? null;
}

/** Items survive their project: the foreign key is `on delete set null`. */
export async function deleteProjectRow(db: Database, id: string): Promise<boolean> {
  const rows = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
  return rows.length > 0;
}
