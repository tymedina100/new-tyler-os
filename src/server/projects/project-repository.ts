import { and, asc, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import type { Project, ProjectRef } from "@/domain/projects/project";
import type { Database } from "@/server/db/client";
import { type NewProjectRow, projects } from "@/server/db/schema";

export async function findProjectById(db: Database, id: string): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

/**
 * Just enough of a project to resolve an `@reference` typed into the capture
 * bar. Every capture reads this, and the capture bar ships it to the browser to
 * preview what will happen, so it deliberately carries nothing else.
 */
export async function listProjectRefs(db: Database): Promise<ProjectRef[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(asc(projects.name));
}

/**
 * The projects a suggestion may name.
 *
 * Deliberately narrower than `listProjectRefs`, which returns everything so an
 * `@reference` can resolve against a project the user knows exists. A proposer
 * gets only what is live: filing a new capture into a finished or archived
 * project is never the right answer, and a shorter list is both a smaller
 * request and a smaller surface to be wrong on.
 */
export async function listSuggestibleProjectRefs(
  db: Database,
  limit: number,
): Promise<ProjectRef[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(inArray(projects.status, ["active", "paused"]))
    .orderBy(asc(sql`lower(${projects.name})`))
    .limit(limit);
}

/**
 * Substring search over a project's name and description.
 *
 * `ILIKE` rather than a `tsvector`, for the reason ADR 019 gave the kitchen:
 * project names are one or two short words, somebody looking for "Desk Setup"
 * types "desk", and full-text search matches whole lexemes so it would miss the
 * half-word. A personal system has a few dozen projects, which is a sequential
 * scan too small to measure — an index that cannot serve a leading wildcard
 * would be decoration, and a generated column to maintain for it more so.
 *
 * Ordering is left to the caller. Search ranks its own results across every
 * domain at once, and a repository that also had an opinion would be quietly
 * competing with it. See src/domain/search/search-ranking.ts.
 */
export async function searchProjects(
  db: Database,
  query: string,
  limit: number,
): Promise<Project[]> {
  return db.select().from(projects).where(nameOrDescriptionMatch(query)).limit(limit);
}

/**
 * Every word has to appear somewhere, in either field, in any order — the same
 * rule the kitchen uses, so "setup desk" and "desk setup" both find the project
 * and search does not behave differently depending on which domain you are in.
 */
function nameOrDescriptionMatch(query: string): SQL {
  const terms = query.split(/\s+/).filter((term) => term.length > 0);

  const conditions = terms.map((term) => {
    const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const match = or(ilike(projects.name, pattern), ilike(projects.description, pattern));

    if (match === undefined) throw new Error("Project search built an empty condition.");
    return match;
  });

  const all = and(...conditions);
  if (all === undefined) throw new Error("Project search built an empty condition.");
  return all;
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
      asc(
        sql`array_position(array['active', 'paused', 'done', 'archived'], ${projects.status}::text)`,
      ),
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
