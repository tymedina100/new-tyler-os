import { DomainError } from "@/domain/shared/errors";
import type { Item, ItemStatus } from "./item";

/**
 * Item lifecycle rules.
 *
 * These are pure functions over the lifecycle fields of an item. They return a
 * patch rather than a mutated item so the persistence layer stays in charge of
 * writing, and so every rule can be tested without a database.
 */

export type ItemLifecycle = Pick<Item, "status" | "completedAt" | "archivedAt">;

export interface ItemStatePatch {
  status: ItemStatus;
  completedAt: Date | null;
  archivedAt: Date | null;
}

export function completeItem(item: ItemLifecycle, now: Date): ItemStatePatch {
  if (item.status === "archived") {
    throw new DomainError(
      "invalid_transition",
      "Restore this item from the archive before completing it.",
    );
  }

  return {
    status: "done",
    completedAt: item.status === "done" ? (item.completedAt ?? now) : now,
    archivedAt: null,
  };
}

/**
 * Reopening lands on `active`, not on the status the item held before it was
 * completed. TylerOS deliberately does not remember pre-completion status:
 * storing it would add a field that exists only to serve undo.
 */
export function reopenItem(item: ItemLifecycle): ItemStatePatch {
  if (item.status !== "done") {
    throw new DomainError("invalid_transition", "Only completed items can be reopened.");
  }

  return { status: "active", completedAt: null, archivedAt: null };
}

export function archiveItem(item: ItemLifecycle, now: Date): ItemStatePatch {
  return {
    status: "archived",
    completedAt: item.completedAt,
    archivedAt: item.status === "archived" ? (item.archivedAt ?? now) : now,
  };
}

/**
 * Restoring returns an item to the inbox rather than to `active`. Something
 * pulled back out of the archive deserves a deliberate re-triage.
 */
export function restoreItem(item: ItemLifecycle): ItemStatePatch {
  if (item.status !== "archived") {
    throw new DomainError("invalid_transition", "Only archived items can be restored.");
  }

  return { status: "inbox", completedAt: null, archivedAt: null };
}

export function toggleItemCompletion(item: ItemLifecycle, now: Date): ItemStatePatch {
  return item.status === "done" ? reopenItem(item) : completeItem(item, now);
}

/**
 * Triaging an untriaged item moves it out of the inbox. Triaging something that
 * already left the inbox leaves its status alone, so editing a completed item
 * does not silently resurrect it.
 */
export function resolveTriagedStatus(
  current: ItemStatus,
  requested: ItemStatus | undefined,
): ItemStatus {
  if (requested !== undefined) return requested;
  return current === "inbox" ? "active" : current;
}

/**
 * Capturing straight into a project is itself an act of triage: the item has
 * already been given a home, so it should not also demand a trip through the
 * inbox.
 */
export function initialCaptureStatus(projectId: string | null): ItemStatus {
  return projectId === null ? "inbox" : "active";
}

/**
 * Moving an item to an explicit status. Reaching a live status clears the
 * completion and archive stamps, so a reopened item carries no ghost timestamps.
 */
export function applyStatusChange(
  item: ItemLifecycle,
  status: ItemStatus,
  now: Date,
): ItemStatePatch {
  if (status === "done") return completeItem(item, now);
  if (status === "archived") return archiveItem(item, now);
  return { status, completedAt: null, archivedAt: null };
}
