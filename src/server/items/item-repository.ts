import { and, desc, eq, ilike, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { ItemKind, ItemStatus, ItemWithRelations } from "@/domain/items/item";
import { OPEN_ITEM_STATUSES } from "@/domain/items/item";
import type { ItemLifecycle } from "@/domain/items/item-rules";
import type { IsoDate } from "@/domain/shared/date";
import type { Database } from "@/server/db/client";
import { itemTags, items, type NewItemRow, tags } from "@/server/db/schema";

/**
 * Data access for items.
 *
 * Repositories speak SQL and return domain shapes. They hold no business rules
 * - those live in src/domain - and they take the database handle as an argument
 * so the same code runs against Postgres and against the test database.
 *
 * The search vector column is never selected: it is large and no caller reads it.
 */

export interface ItemListFilters {
  statuses?: readonly ItemStatus[];
  kinds?: readonly ItemKind[];
  projectId?: string;
  tagName?: string;
  limit?: number;
}

interface ItemRecord {
  id: string;
  title: string;
  body: string | null;
  kind: ItemKind;
  status: ItemStatus;
  dueOn: string | null;
  projectId: string | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; name: string } | null;
  itemTags: { tag: { id: string; name: string } }[];
}

function toItemWithRelations(row: ItemRecord): ItemWithRelations {
  const { itemTags: links, ...item } = row;
  return { ...item, tags: links.map((link) => link.tag) };
}

const RELATIONS = {
  project: { columns: { id: true, name: true } },
  itemTags: { with: { tag: { columns: { id: true, name: true } } } },
} as const;

const WITHOUT_SEARCH_VECTOR = { searchVector: false } as const;

export async function findItemById(db: Database, id: string): Promise<ItemWithRelations | null> {
  const row = await db.query.items.findFirst({
    where: eq(items.id, id),
    columns: WITHOUT_SEARCH_VECTOR,
    with: RELATIONS,
  });

  return row ? toItemWithRelations(row) : null;
}

/** Only the fields the lifecycle rules need, so a checkbox click stays cheap. */
export async function findItemLifecycle(db: Database, id: string): Promise<ItemLifecycle | null> {
  const [row] = await db
    .select({
      status: items.status,
      completedAt: items.completedAt,
      archivedAt: items.archivedAt,
    })
    .from(items)
    .where(eq(items.id, id))
    .limit(1);

  return row ?? null;
}

export async function listItems(
  db: Database,
  filters: ItemListFilters = {},
): Promise<ItemWithRelations[]> {
  const conditions: SQL[] = [];

  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(items.status, [...filters.statuses]));
  }
  if (filters.kinds && filters.kinds.length > 0) {
    conditions.push(inArray(items.kind, [...filters.kinds]));
  }
  if (filters.projectId) {
    conditions.push(eq(items.projectId, filters.projectId));
  }
  if (filters.tagName) {
    conditions.push(inArray(items.id, itemIdsWithTag(db, filters.tagName)));
  }

  const rows = await db.query.items.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    columns: WITHOUT_SEARCH_VECTOR,
    with: RELATIONS,
    orderBy: [sql`${items.dueOn} asc nulls last`, desc(items.createdAt)],
    limit: filters.limit ?? 200,
  });

  return rows.map(toItemWithRelations);
}

/**
 * Everything the Today view might care about: open work due inside the horizon,
 * plus anything still sitting untriaged in the inbox. The bucketing itself is a
 * pure function - see src/domain/today/today-view.ts.
 */
export async function listTodayCandidates(
  db: Database,
  horizon: IsoDate,
): Promise<ItemWithRelations[]> {
  const rows = await db.query.items.findMany({
    where: and(
      inArray(items.status, [...OPEN_ITEM_STATUSES]),
      or(lte(items.dueOn, horizon), eq(items.status, "inbox")),
    ),
    columns: WITHOUT_SEARCH_VECTOR,
    with: RELATIONS,
    orderBy: [sql`${items.dueOn} asc nulls last`, desc(items.createdAt)],
    limit: 500,
  });

  return rows.map(toItemWithRelations);
}

/**
 * Full-text search with a substring fallback.
 *
 * Postgres full-text search matches whole lexemes, so "sever" would never find
 * "Severance". Personal search is mostly half-remembered fragments, so an ILIKE
 * pass runs alongside it and ranks below the real matches.
 */
export async function searchItems(
  db: Database,
  query: string,
  limit = 50,
): Promise<ItemWithRelations[]> {
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;
  const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

  const rows = await db.query.items.findMany({
    where: or(
      sql`${items.searchVector} @@ ${tsQuery}`,
      ilike(items.title, pattern),
      ilike(items.body, pattern),
    ),
    columns: WITHOUT_SEARCH_VECTOR,
    with: RELATIONS,
    orderBy: [desc(sql`ts_rank(${items.searchVector}, ${tsQuery})`), desc(items.createdAt)],
    limit,
  });

  return rows.map(toItemWithRelations);
}

export async function insertItem(db: Database, values: NewItemRow): Promise<string> {
  const [row] = await db.insert(items).values(values).returning({ id: items.id });

  if (!row) throw new Error("Insert returned no item id.");
  return row.id;
}

export async function updateItemRow(
  db: Database,
  id: string,
  patch: Partial<NewItemRow>,
): Promise<string | null> {
  const [row] = await db
    .update(items)
    .set(patch)
    .where(eq(items.id, id))
    .returning({ id: items.id });

  return row?.id ?? null;
}

export async function deleteItemRow(db: Database, id: string): Promise<boolean> {
  const rows = await db.delete(items).where(eq(items.id, id)).returning({ id: items.id });
  return rows.length > 0;
}

export async function replaceItemTags(
  db: Database,
  itemId: string,
  tagIds: readonly string[],
): Promise<void> {
  await db.delete(itemTags).where(eq(itemTags.itemId, itemId));

  if (tagIds.length > 0) {
    await db.insert(itemTags).values(tagIds.map((tagId) => ({ itemId, tagId })));
  }
}

export async function countItemsByStatus(db: Database): Promise<Record<ItemStatus, number>> {
  const rows = await db
    .select({ status: items.status, count: sql<number>`count(*)`.mapWith(Number) })
    .from(items)
    .groupBy(items.status);

  const counts: Record<ItemStatus, number> = {
    inbox: 0,
    active: 0,
    someday: 0,
    done: 0,
    archived: 0,
  };

  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

export interface ProjectItemCounts {
  open: number;
  completed: number;
}

/** Archived items count towards neither side: archiving means "no longer mine". */
export async function countItemsByProject(db: Database): Promise<Map<string, ProjectItemCounts>> {
  const rows = await db
    .select({
      projectId: items.projectId,
      open: sql<number>`count(*) filter (where ${items.status} in ('inbox', 'active', 'someday'))`.mapWith(
        Number,
      ),
      completed: sql<number>`count(*) filter (where ${items.status} = 'done')`.mapWith(Number),
    })
    .from(items)
    .where(isNotNull(items.projectId))
    .groupBy(items.projectId);

  const counts = new Map<string, ProjectItemCounts>();
  for (const row of rows) {
    if (row.projectId) counts.set(row.projectId, { open: row.open, completed: row.completed });
  }
  return counts;
}

function itemIdsWithTag(db: Database, tagName: string) {
  return db
    .select({ id: itemTags.itemId })
    .from(itemTags)
    .innerJoin(tags, eq(tags.id, itemTags.tagId))
    .where(eq(tags.name, tagName));
}
