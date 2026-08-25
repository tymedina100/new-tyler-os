import type { IsoDate } from "@/domain/shared/date";
import type { TagRef } from "@/domain/tags/tag";

/**
 * The Item is the spine of TylerOS.
 *
 * Everything captured is an Item. The inbox is not a separate entity; it is the
 * `inbox` status, meaning "captured but not yet triaged". Triage assigns a kind,
 * and optionally a project, tags and a due date.
 *
 * Kinds intentionally mirror the modules TylerOS will grow into, so that a
 * future media module can query `kind = 'media'` rather than inventing a
 * parallel store. Structured records that are not "things I captured or need to
 * act on" — pantry stock, warranties, appliance manuals — are NOT items and get
 * their own tables. See docs/ARCHITECTURE.md.
 */

export const ITEM_KINDS = ["task", "note", "idea", "media", "purchase"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_STATUSES = ["inbox", "active", "someday", "done", "archived"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Statuses that still want attention. Excludes `done` and `archived`. */
export const OPEN_ITEM_STATUSES = ["inbox", "active", "someday"] as const;

export interface Item {
  id: string;
  title: string;
  body: string | null;
  kind: ItemKind;
  status: ItemStatus;
  dueOn: IsoDate | null;
  projectId: string | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItemWithRelations extends Item {
  project: { id: string; name: string } | null;
  tags: TagRef[];
}

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  task: "Task",
  note: "Note",
  idea: "Idea",
  media: "Media",
  purchase: "Purchase",
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  inbox: "Inbox",
  active: "Active",
  someday: "Someday",
  done: "Done",
  archived: "Archived",
};

export function isOpenStatus(status: ItemStatus): boolean {
  return (OPEN_ITEM_STATUSES as readonly ItemStatus[]).includes(status);
}

export function isItemKind(value: string): value is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value);
}
