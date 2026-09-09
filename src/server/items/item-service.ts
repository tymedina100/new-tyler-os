import { assertItemVersion } from "@/domain/items/item-version";
import * as versions from "@/server/items/item-version-repository";
import { parseCapture } from "@/domain/capture/parse-capture";
import type { ItemKind, ItemStatus, ItemWithRelations } from "@/domain/items/item";
import type { ItemLifecycle } from "@/domain/items/item-rules";
import {
  applyStatusChange,
  initialCaptureStatus,
  resolveTriagedStatus,
  restoreItem,
  toggleItemCompletion,
} from "@/domain/items/item-rules";
import type { CaptureItemInput, UpdateItemInput } from "@/domain/items/item-schema";
import type { ItemRecurrence, RecurrenceRule } from "@/domain/recurrence/recurrence";
import type { RecurrencePatch } from "@/domain/recurrence/recurrence-rules";
import {
  completeOccurrence,
  resolveAnchor,
  skipOccurrence,
  startingOccurrence,
} from "@/domain/recurrence/recurrence-rules";
import { addDays, type IsoDate, todayIsoDate } from "@/domain/shared/date";
import { DomainError, NotFoundError } from "@/domain/shared/errors";
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
 *
 * A parsed repeat is written through the same `writeRecurrence` the editor uses,
 * so a responsibility captured as "bins every tuesday" is indistinguishable
 * from one set up by hand — same anchor rule, same row, same everything after.
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

    // Nothing is stored yet, so there is no prior anchor to preserve: the
    // parsed due date becomes the anchor, which is what `resolveAnchor` returns
    // for an item with no existing recurrence.
    await writeRecurrence(
      tx,
      id,
      { dueOn: null, recurrence: null },
      parsed.recurrence,
      parsed.dueOn,
    );
    await attachTags(tx, id, parsed.tags);
    return id;
  });
}

/** Full drafts must still match the snapshot that seeded the editor. */
export async function updateItemFromSnapshot(
  db: Database,
  input: UpdateItemInput,
  expectedUpdatedAt: string,
): Promise<ItemWithRelations> {
  return db.transaction(async (tx) => {
    const row = await versions.lockItem(tx, input.id);
    if (!row) throw new NotFoundError("Item", input.id);
    assertItemVersion(row.updatedAt, expectedUpdatedAt);
    await updateItem(tx, input);
    await versions.advanceItemVersion(tx, input.id, row.updatedAt);
    const saved = await getItem(tx, input.id);
    if (!saved) throw new NotFoundError("Item", input.id);
    return saved;
  });
}

export async function updateItem(
  db: Database,
  input: UpdateItemInput,
  now = new Date(),
): Promise<string> {
  return db.transaction(async (tx) => {
    const schedule = await requireSchedule(tx, input.id);
    const statePatch = applyStatusChange(schedule.lifecycle, input.status, now);

    await repo.updateItemRow(tx, input.id, {
      title: input.title,
      body: input.body,
      kind: input.kind,
      dueOn: input.dueOn,
      projectId: input.projectId,
      ...statePatch,
    });

    await writeRecurrence(tx, input.id, schedule, input.recurrence, input.dueOn);
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

/**
 * Filing an item into a project, or out of one.
 *
 * The sibling of `setItemKind`, and triages for the same reason: giving
 * something a home is a decision about it, so it leaves the inbox — exactly as
 * `setItemDueDate` already does for a date.
 */
export async function setItemProject(
  db: Database,
  id: string,
  projectId: string | null,
): Promise<void> {
  const lifecycle = await requireLifecycle(db, id);

  await repo.updateItemRow(db, id, {
    projectId,
    status:
      projectId === null ? lifecycle.status : resolveTriagedStatus(lifecycle.status, undefined),
  });
}

/**
 * Adding one tag, leaving the others alone.
 *
 * Additive, unlike the editor's `replaceItemTags`: this exists so a single tag
 * can be added without a caller having to send the whole set back, which is the
 * only way to add one without racing whatever else changed in the meantime.
 *
 * Deliberately does **not** triage. A kind says what something is and a project
 * says where it lives; a tag is a cross-cutting label and answers neither. If
 * accepting one ejected an item from the inbox, it would take the untriaged
 * item off the triage screen before its kind had been decided.
 */
export async function addItemTag(db: Database, id: string, name: string): Promise<void> {
  await requireLifecycle(db, id);

  await db.transaction(async (tx) => {
    const [tag] = await ensureTags(tx, [name]);
    if (tag === undefined) throw new DomainError("conflict", "That tag could not be created.");

    await repo.addItemTag(tx, id, tag.id);
  });
}

export async function setItemStatus(
  db: Database,
  id: string,
  status: ItemStatus,
  now = new Date(),
): Promise<CompletionOutcome> {
  const schedule = await requireSchedule(db, id);

  // Reaching `done` by any route completes the current occurrence, never the
  // responsibility. There is no path in TylerOS that can permanently finish a
  // repeat by accident; ending one is an explicit edit. See ADR 022.
  if (status === "done" && schedule.recurrence !== null) {
    return settleOccurrence(db, id, schedule, todayIsoDate(now), completeOccurrence);
  }

  await repo.updateItemRow(db, id, applyStatusChange(schedule.lifecycle, status, now));
  return { nextDueOn: null };
}

export async function setItemDueDate(
  db: Database,
  id: string,
  dueOn: IsoDate | null,
): Promise<void> {
  const schedule = await requireSchedule(db, id);

  if (dueOn === null && schedule.recurrence !== null) {
    throw new DomainError(
      "invalid_transition",
      "A repeating item needs a date. Stop it repeating before clearing the date.",
    );
  }

  await repo.updateItemRow(db, id, {
    dueOn,
    // Giving something a date is a decision about it, so it leaves the inbox.
    status:
      dueOn === null
        ? schedule.lifecycle.status
        : resolveTriagedStatus(schedule.lifecycle.status, undefined),
  });

  if (dueOn !== null && schedule.recurrence !== null) {
    // Moving the date of a repeat reschedules the series, so it re-anchors.
    await repo.updateItemRecurrenceRow(db, id, {
      anchorOn: resolveAnchor(
        { anchorOn: schedule.recurrence.anchorOn, dueOn: schedule.dueOn },
        dueOn,
      ),
    });
  }
}

/** What the caller needs to tell the user, once an occurrence has been settled. */
export interface CompletionOutcome {
  /** The date this item is next due, or `null` when it does not repeat. */
  nextDueOn: IsoDate | null;
}

export async function toggleItemCompletionById(
  db: Database,
  id: string,
  now = new Date(),
): Promise<CompletionOutcome> {
  const schedule = await requireSchedule(db, id);

  if (schedule.recurrence !== null && schedule.lifecycle.status !== "done") {
    return settleOccurrence(db, id, schedule, todayIsoDate(now), completeOccurrence);
  }

  await repo.updateItemRow(db, id, toggleItemCompletion(schedule.lifecycle, now));
  return { nextDueOn: null };
}

/**
 * Letting one occurrence go by.
 *
 * The honest counterpart to completing. Without it, the only way to clear a
 * repeat you genuinely did not do is to claim you did — and a personal system
 * that has been lied to once is a personal system nobody trusts again.
 */
export async function skipItemOccurrence(
  db: Database,
  id: string,
  now = new Date(),
): Promise<CompletionOutcome> {
  const schedule = await requireSchedule(db, id);

  if (schedule.recurrence === null) {
    throw new DomainError("invalid_transition", "Only a repeating item has an occurrence to skip.");
  }

  return settleOccurrence(db, id, schedule, todayIsoDate(now), skipOccurrence);
}

/**
 * Making an item repeat, changing how it repeats, or stopping it.
 *
 * One entry point for all three, because they are the same decision seen from
 * different sides and splitting them would mean three places that have to agree
 * about the anchor.
 */
export async function setItemRecurrence(
  db: Database,
  id: string,
  rule: RecurrenceRule | null,
  now = new Date(),
): Promise<{ dueOn: IsoDate | null; recurrence: ItemRecurrence | null }> {
  const schedule = await requireSchedule(db, id);

  if (rule === null) {
    await repo.deleteItemRecurrence(db, id);
    return { dueOn: schedule.dueOn, recurrence: null };
  }

  const dueOn = startingOccurrence(schedule.dueOn, todayIsoDate(now));

  return db.transaction(async (tx) => {
    if (dueOn !== schedule.dueOn) {
      await repo.updateItemRow(tx, id, {
        dueOn,
        status: resolveTriagedStatus(schedule.lifecycle.status, undefined),
      });
    }

    const recurrence = await writeRecurrence(tx, id, schedule, rule, dueOn);
    return { dueOn, recurrence };
  });
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

async function requireSchedule(db: Database, id: string): Promise<repo.ItemSchedule> {
  const schedule = await repo.findItemSchedule(db, id);
  if (!schedule) throw new NotFoundError("Item", id);
  return schedule;
}

/**
 * Moving a recurring item on to its next occurrence.
 *
 * The domain decided *which* date; this only writes it. The item stays open —
 * that is the whole point — and any completion or archive stamp is cleared,
 * because a responsibility that is due again is not a finished one.
 *
 * `startingOccurrence` repairs the one state that should not exist: a repeat
 * with no current date. Healing it deterministically beats throwing at someone
 * who just clicked a checkbox.
 */
async function settleOccurrence(
  db: Database,
  id: string,
  schedule: repo.ItemSchedule,
  today: IsoDate,
  settle: (recurrence: ItemRecurrence, dueOn: IsoDate, today: IsoDate) => RecurrencePatch,
): Promise<CompletionOutcome> {
  const recurrence = schedule.recurrence;
  if (recurrence === null) {
    throw new DomainError("invalid_transition", "This item does not repeat.");
  }

  const patch = settle(recurrence, startingOccurrence(schedule.dueOn, today), today);

  await db.transaction(async (tx) => {
    await repo.updateItemRow(tx, id, {
      dueOn: patch.dueOn,
      status: resolveTriagedStatus(schedule.lifecycle.status, undefined),
      completedAt: null,
      archivedAt: null,
    });

    if (patch.lastCompletedOn !== recurrence.lastCompletedOn) {
      await repo.updateItemRecurrenceRow(tx, id, { lastCompletedOn: patch.lastCompletedOn });
    }
  });

  return { nextDueOn: patch.dueOn };
}

/**
 * Persisting a rule, or removing one.
 *
 * The anchor is the subtle part: it is kept as it was unless the due date
 * actually moved, so saving the editor without touching the date cannot turn
 * "monthly on the 31st" into "monthly on the 28th" after one short February.
 */
async function writeRecurrence(
  db: Database,
  id: string,
  /**
   * What is already stored. Narrowed to the two fields the anchor rule needs so
   * a freshly captured item — which has neither — can use this same path rather
   * than growing a second place that decides anchors.
   */
  schedule: { dueOn: IsoDate | null; recurrence: ItemRecurrence | null },
  rule: RecurrenceRule | null,
  dueOn: IsoDate | null,
): Promise<ItemRecurrence | null> {
  if (rule === null || dueOn === null) {
    if (schedule.recurrence !== null) await repo.deleteItemRecurrence(db, id);
    return null;
  }

  const existing = schedule.recurrence;
  const recurrence: ItemRecurrence = {
    ...rule,
    anchorOn: resolveAnchor(
      existing && { anchorOn: existing.anchorOn, dueOn: schedule.dueOn },
      dueOn,
    ),
    lastCompletedOn: existing?.lastCompletedOn ?? null,
  };

  await repo.upsertItemRecurrence(db, { itemId: id, ...recurrence });
  return recurrence;
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
 * Retrieval no longer lives here.
 *
 * `findItems` used to be "the universal retrieval path", back when universal
 * meant items. It does not any more: a query now reaches the projects and the
 * kitchen as well, and composing that belongs to something that answers to
 * none of the three. See `src/server/search/search-service.ts` and ADR 028.
 *
 * Items are still searched by `searchItems` in this domain's own repository —
 * the `tsvector` and its `ILIKE` fallback are unchanged and still item-owned.
 * What went away is the item spine pretending to be the whole system.
 */
