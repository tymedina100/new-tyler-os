import { parseCapture } from "@/domain/capture/parse-capture";
import type { ItemKind, ItemStatus, ItemWithRelations } from "@/domain/items/item";
import { type ItemFilters, matchesItemFilters } from "@/domain/items/item-filters";
import type { ItemLifecycle } from "@/domain/items/item-rules";
import {
  applyStatusChange,
  initialCaptureStatus,
  resolveTriagedStatus,
  restoreItem,
  toggleItemCompletion,
} from "@/domain/items/item-rules";
import type { CaptureItemInput, UpdateItemInput } from "@/domain/items/item-schema";
import { addDays, type IsoDate, todayIsoDate } from "@/domain/shared/date";
import { NotFoundError } from "@/domain/shared/errors";
import { buildTodayView, type TodayView, UPCOMING_WINDOW_DAYS } from "@/domain/today/today-view";
import type { Database } from "@/server/db/client";
import * as repo from "@/server/items/item-repository";
import { listProjectRefs } from "@/server/projects/project-repository";
import { deleteOrphanedTags, ensureTags } from "@/server/tags/tag-repository";

/**
 * Item use cases.
 *
 * Services orchestrate: they load state, ask the domain what should happen, and
 * hand the resulting patch to a repository. They contain no rules of their own,
 * which is why the interesting behaviour is testable without a database.
 */

/**
 * Capture: the one path every piece of information enters TylerOS through.
 *
 * The text is parsed for a date, a project and tags before anything is written,
 * so "pay electric bill friday @Home #finance" arrives already filed. An inline
 * `@project` wins over the page the capture came from: typing the reference is
 * a more specific instruction than standing on a project screen.
 *
 * A parsed due date does **not** take the item out of the inbox. Its kind is
 * still undecided, and `buildTodayView` already files a dated inbox item under
 * its date rather than under "needs triage", so nothing is hidden by waiting.
 */
export async function captureItem(
  db: Database,
  input: CaptureItemInput,
  now = new Date(),
): Promise<string> {
  const projects = await listProjectRefs(db);
  const parsed = parseCapture(input.text, { today: todayIsoDate(now), projects });
  const projectId = parsed.projectId ?? input.projectId;

  return db.transaction(async (tx) => {
    const id = await repo.insertItem(tx, {
      title: parsed.title,
      status: initialCaptureStatus(projectId),
      dueOn: parsed.dueOn,
      projectId,
    });

    await attachTags(tx, id, parsed.tags);
    return id;
  });
}

export async function updateItem(
  db: Database,
  input: UpdateItemInput,
  now = new Date(),
): Promise<string> {
  return db.transaction(async (tx) => {
    const lifecycle = await requireLifecycle(tx, input.id);
    const statePatch = applyStatusChange(lifecycle, input.status, now);

    await repo.updateItemRow(tx, input.id, {
      title: input.title,
      body: input.body,
      kind: input.kind,
      dueOn: input.dueOn,
      projectId: input.projectId,
      ...statePatch,
    });

    await attachTags(tx, input.id, input.tags);
    await deleteOrphanedTags(tx);
    return input.id;
  });
}

/** Assigning a kind is the whole of triage for most items. */
export async function setItemKind(db: Database, id: string, kind: ItemKind): Promise<void> {
  const lifecycle = await requireLifecycle(db, id);

  await repo.updateItemRow(db, id, {
    kind,
    status: resolveTriagedStatus(lifecycle.status, undefined),
  });
}

export async function setItemStatus(
  db: Database,
  id: string,
  status: ItemStatus,
  now = new Date(),
): Promise<void> {
  const lifecycle = await requireLifecycle(db, id);
  await repo.updateItemRow(db, id, applyStatusChange(lifecycle, status, now));
}

export async function setItemDueDate(
  db: Database,
  id: string,
  dueOn: IsoDate | null,
): Promise<void> {
  const lifecycle = await requireLifecycle(db, id);

  await repo.updateItemRow(db, id, {
    dueOn,
    // Giving something a date is a decision about it, so it leaves the inbox.
    status: dueOn === null ? lifecycle.status : resolveTriagedStatus(lifecycle.status, undefined),
  });
}

export async function toggleItemCompletionById(
  db: Database,
  id: string,
  now = new Date(),
): Promise<void> {
  const lifecycle = await requireLifecycle(db, id);
  await repo.updateItemRow(db, id, toggleItemCompletion(lifecycle, now));
}

export async function restoreItemById(db: Database, id: string): Promise<void> {
  const lifecycle = await requireLifecycle(db, id);
  await repo.updateItemRow(db, id, restoreItem(lifecycle));
}

export async function deleteItem(db: Database, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await repo.deleteItemRow(tx, id);
    if (!deleted) throw new NotFoundError("Item", id);
    await deleteOrphanedTags(tx);
  });
}

export async function getItem(db: Database, id: string): Promise<ItemWithRelations | null> {
  return repo.findItemById(db, id);
}

export async function listInboxItems(db: Database): Promise<ItemWithRelations[]> {
  return repo.listItems(db, { statuses: ["inbox"] });
}

export async function listItemsForView(
  db: Database,
  filters: repo.ItemListFilters,
): Promise<ItemWithRelations[]> {
  return repo.listItems(db, filters);
}

export interface TodayData {
  today: IsoDate;
  view: TodayView<ItemWithRelations>;
}

export async function getTodayData(db: Database, now = new Date()): Promise<TodayData> {
  const today = todayIsoDate(now);
  const candidates = await repo.listTodayCandidates(db, addDays(today, UPCOMING_WINDOW_DAYS));

  return { today, view: buildTodayView(candidates, today) };
}

export async function countItemsByStatus(db: Database) {
  return repo.countItemsByStatus(db);
}

async function requireLifecycle(db: Database, id: string): Promise<ItemLifecycle> {
  const lifecycle = await repo.findItemLifecycle(db, id);
  if (!lifecycle) throw new NotFoundError("Item", id);
  return lifecycle;
}

async function attachTags(db: Database, itemId: string, names: readonly string[]): Promise<void> {
  const rows = await ensureTags(db, names);
  await repo.replaceItemTags(
    db,
    itemId,
    rows.map((row) => row.id),
  );
}

/**
 * The universal retrieval path.
 *
 * With a search term, Postgres ranks the matches and any further filters narrow
 * that ranked list in memory - re-querying would discard the ranking. Without
 * one, the filters go straight to SQL where they belong.
 */
export async function findItems(
  db: Database,
  search: string | undefined,
  filters: ItemFilters,
): Promise<ItemWithRelations[]> {
  if (search) {
    const results = await repo.searchItems(db, search);
    return results.filter((item) => matchesItemFilters(item, filters));
  }

  return repo.listItems(db, filters);
}
