import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { itemTags, type TagRow, tags } from "@/server/db/schema";

/**
 * Tag names arrive already normalised from the domain, so the unique index on
 * `name` is enough to keep "#Home" and "#home" the same row.
 */
export async function ensureTags(db: Database, names: readonly string[]): Promise<TagRow[]> {
  if (names.length === 0) return [];

  await db
    .insert(tags)
    .values(names.map((name) => ({ name })))
    .onConflictDoNothing({ target: tags.name });

  return db
    .select()
    .from(tags)
    .where(inArray(tags.name, [...names]));
}

export interface TagUsage {
  id: string;
  name: string;
  count: number;
}

export async function listTagsWithUsage(db: Database): Promise<TagUsage[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      count: sql<number>`count(${itemTags.itemId})`.mapWith(Number),
    })
    .from(tags)
    .leftJoin(itemTags, eq(itemTags.tagId, tags.id))
    .groupBy(tags.id, tags.name)
    .orderBy(desc(sql`count(${itemTags.itemId})`), asc(tags.name));
}

/**
 * Tags only exist to label items. One left attached to nothing is clutter in
 * every filter list, so it is removed as soon as its last item lets go.
 */
export async function deleteOrphanedTags(db: Database): Promise<void> {
  await db.execute(
    sql`delete from ${tags} where not exists (select 1 from ${itemTags} where ${itemTags.tagId} = ${tags.id})`,
  );
}
