import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { itemTags, noteTags, type TagRow, tags } from "@/server/db/schema";

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
 * The tags a suggestion may name, most-used first.
 *
 * A closed vocabulary is the whole tag safety story: a proposer chooses from
 * what the user has already established or it proposes nothing. Nothing here
 * can create a tag — `ensureTags` does that, and only once somebody has
 * accepted. Ordering by usage means the cap keeps the tags that actually
 * organise this system rather than an alphabetical slice of it.
 */
export async function listTagNamesByUsage(db: Database, limit: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name, count: sql<number>`count(${itemTags.itemId})`.mapWith(Number) })
    .from(tags)
    .leftJoin(itemTags, eq(itemTags.tagId, tags.id))
    .groupBy(tags.id, tags.name)
    .orderBy(desc(sql`count(${itemTags.itemId})`), asc(tags.name))
    .limit(limit);

  return rows.map((row) => row.name);
}

/**
 * Tags only exist to label items and notes. One left attached to neither is
 * clutter in every filter list, so it is removed as soon as its last user
 * lets go.
 *
 * Both `item_tags` and `note_tags` have to be checked, not just one: a tag
 * shared by an item and a note must survive the item losing it, and the
 * cheapest way to get that wrong is to write this against the table whichever
 * caller happens to be nearer. Every caller that can detach a tag from either
 * domain — `item-service.ts` and `note-service.ts` — runs this same function
 * afterwards, so there is exactly one place that decides "orphaned."
 */
export async function deleteOrphanedTags(db: Database): Promise<void> {
  await db.execute(
    sql`delete from ${tags}
        where not exists (select 1 from ${itemTags} where ${itemTags.tagId} = ${tags.id})
          and not exists (select 1 from ${noteTags} where ${noteTags.tagId} = ${tags.id})`,
  );
}
