import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type {
  ItemSuggestion,
  ItemSuggestionView,
  SuggestionStatus,
} from "@/domain/suggestions/suggestion";
import type { Database } from "@/server/db/client";
import { itemSuggestions, type NewItemSuggestionRow } from "@/server/db/schema";

/**
 * Data access for suggestions. Speaks SQL, holds no rules.
 *
 * Every read here is scoped to `pending` or to a single id. Nothing lists a
 * user's whole suggestion history, because nothing needs to: a resolved
 * proposal exists to stop the same one being offered twice, not to be browsed.
 */

/**
 * Insert, ignoring anything already proposed.
 *
 * `on conflict do nothing` against the unique proposal index is what makes a
 * retried or double-invoked request harmless: a repeat writes nothing rather
 * than stacking a second identical chip in front of the user, and a proposal
 * already dismissed cannot reappear to be dismissed again.
 */
export async function insertSuggestions(
  db: Database,
  rows: readonly NewItemSuggestionRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const inserted = await db
    .insert(itemSuggestions)
    .values([...rows])
    .onConflictDoNothing()
    .returning({ id: itemSuggestions.id });

  return inserted.length;
}

/**
 * Has this item ever been through the proposer?
 *
 * Counts resolved rows as well as pending ones, on purpose. One pass per item,
 * ever — which is both the retry guard and the answer to persistent nagging.
 */
export async function countSuggestionsForItem(db: Database, itemId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(itemSuggestions)
    .where(eq(itemSuggestions.itemId, itemId));

  return row?.count ?? 0;
}

export async function findSuggestionById(db: Database, id: string): Promise<ItemSuggestion | null> {
  const row = await db.query.itemSuggestions.findFirst({ where: eq(itemSuggestions.id, id) });
  return row ?? null;
}

/**
 * The pending proposals for a screenful of items, in one query.
 *
 * Item lists render many rows at once, so this takes the ids rather than being
 * called per row. The project is joined because the chip shows a name and the
 * client must never be handed an id to resolve on its own.
 */
export async function listPendingSuggestions(
  db: Database,
  itemIds: readonly string[],
): Promise<ItemSuggestionView[]> {
  if (itemIds.length === 0) return [];

  return db.query.itemSuggestions.findMany({
    where: and(
      inArray(itemSuggestions.itemId, [...itemIds]),
      eq(itemSuggestions.status, "pending"),
    ),
    with: { project: { columns: { id: true, name: true } } },
    // Kind, then project, then tags: the order the fields are decided in.
    orderBy: [asc(itemSuggestions.field), asc(itemSuggestions.createdAt)],
  });
}

/** Marking one proposal settled. Only ever moves a `pending` row. */
export async function resolveSuggestion(
  db: Database,
  id: string,
  status: Exclude<SuggestionStatus, "pending">,
  now: Date,
): Promise<boolean> {
  const rows = await db
    .update(itemSuggestions)
    .set({ status, resolvedAt: now })
    .where(and(eq(itemSuggestions.id, id), eq(itemSuggestions.status, "pending")))
    .returning({ id: itemSuggestions.id });

  return rows.length > 0;
}

/** Waving away everything still pending on one item, in a single statement. */
export async function dismissPendingForItem(
  db: Database,
  itemId: string,
  now: Date,
): Promise<number> {
  const rows = await db
    .update(itemSuggestions)
    .set({ status: "dismissed", resolvedAt: now })
    .where(and(eq(itemSuggestions.itemId, itemId), eq(itemSuggestions.status, "pending")))
    .returning({ id: itemSuggestions.id });

  return rows.length;
}
