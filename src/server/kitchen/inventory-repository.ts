import { and, asc, eq, ilike, isNotNull, lte, or, type SQL, sql } from "drizzle-orm";
import type { InventoryItem, KitchenLocation } from "@/domain/kitchen/inventory";
import type { IsoDate } from "@/domain/shared/date";
import type { Database } from "@/server/db/client";
import { kitchenInventory, type NewKitchenInventoryRow } from "@/server/db/schema";

/**
 * SQL for kitchen inventory. No rules live here.
 *
 * Ordering is done in SQL rather than in the domain because the list is read
 * far more often than it is written, and "what is about to go off" is the
 * question the page exists to answer: dated food first, soonest at the top,
 * then everything undated by name.
 */

export interface InventoryFilters {
  location?: KitchenLocation | undefined;
  search?: string | undefined;
}

const ORDER_BY = [
  sql`${kitchenInventory.expiresOn} asc nulls last`,
  asc(sql`lower(${kitchenInventory.name})`),
];

export async function listInventory(
  db: Database,
  filters: InventoryFilters = {},
): Promise<InventoryItem[]> {
  const conditions: SQL[] = [];

  if (filters.location) {
    conditions.push(eq(kitchenInventory.location, filters.location));
  }
  if (filters.search) {
    conditions.push(nameOrNotesMatch(filters.search));
  }

  const rows = await db
    .select()
    .from(kitchenInventory)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...ORDER_BY);

  return rows;
}

/**
 * Substring matching, not `tsvector`.
 *
 * Product names are one or two short words, and someone looking for chicken
 * types "chick". Full-text search matches whole lexemes and would miss that,
 * which is the opposite of what this table needs. At the size a kitchen reaches
 * this is a sequential scan over a few hundred rows, and an index that cannot
 * serve a leading wildcard would be decoration.
 */
export async function searchInventory(
  db: Database,
  query: string,
  limit = 20,
): Promise<InventoryItem[]> {
  return db
    .select()
    .from(kitchenInventory)
    .where(nameOrNotesMatch(query))
    .orderBy(...ORDER_BY)
    .limit(limit);
}

/**
 * Every word has to appear somewhere, in any order.
 *
 * "greek yogurt" and "yogurt greek" should both find the pot in the fridge. A
 * single substring over the whole phrase only matches words typed adjacently,
 * which is not how anyone recalls what they bought.
 */
function nameOrNotesMatch(query: string): SQL {
  const terms = query.split(/\s+/).filter((term) => term.length > 0);

  const conditions = terms.map((term) => {
    const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const match = or(ilike(kitchenInventory.name, pattern), ilike(kitchenInventory.notes, pattern));

    if (match === undefined) throw new Error("Inventory search built an empty condition.");
    return match;
  });

  const all = and(...conditions);
  if (all === undefined) throw new Error("Inventory search built an empty condition.");
  return all;
}

/** Everything dated on or before `through`, for the "use this up" nudge. */
export async function listExpiringThrough(
  db: Database,
  through: IsoDate,
): Promise<InventoryItem[]> {
  return db
    .select()
    .from(kitchenInventory)
    .where(and(isNotNull(kitchenInventory.expiresOn), lte(kitchenInventory.expiresOn, through)))
    .orderBy(...ORDER_BY);
}

export async function findInventoryItemById(
  db: Database,
  id: string,
): Promise<InventoryItem | null> {
  const [row] = await db
    .select()
    .from(kitchenInventory)
    .where(eq(kitchenInventory.id, id))
    .limit(1);

  return row ?? null;
}

export async function countInventoryByLocation(
  db: Database,
): Promise<Map<KitchenLocation, number>> {
  const rows = await db
    .select({
      location: kitchenInventory.location,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(kitchenInventory)
    .groupBy(kitchenInventory.location);

  return new Map(rows.map((row) => [row.location, row.count]));
}

export async function insertInventoryItem(
  db: Database,
  values: NewKitchenInventoryRow,
): Promise<string> {
  const [row] = await db.insert(kitchenInventory).values(values).returning({
    id: kitchenInventory.id,
  });

  if (!row) throw new Error("Insert returned no inventory id.");
  return row.id;
}

export async function updateInventoryRow(
  db: Database,
  id: string,
  patch: Partial<NewKitchenInventoryRow>,
): Promise<string | null> {
  const [row] = await db
    .update(kitchenInventory)
    .set(patch)
    .where(eq(kitchenInventory.id, id))
    .returning({ id: kitchenInventory.id });

  return row?.id ?? null;
}

export async function deleteInventoryRow(db: Database, id: string): Promise<boolean> {
  const rows = await db
    .delete(kitchenInventory)
    .where(eq(kitchenInventory.id, id))
    .returning({ id: kitchenInventory.id });

  return rows.length > 0;
}
