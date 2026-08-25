import type { Item, ItemKind, ItemStatus, ItemWithRelations } from "./item";
import { isItemKind, OPEN_ITEM_STATUSES } from "./item";

/**
 * How items are narrowed down, in one vocabulary.
 *
 * The same shape drives the SQL filters, the in-memory predicate and the URL
 * parsing, so a filter cannot mean one thing on the tasks page and another on
 * search.
 */
export interface ItemFilters {
  kinds?: readonly ItemKind[];
  statuses?: readonly ItemStatus[];
  projectId?: string;
  tagName?: string;
}

type FilterableItem = Pick<Item, "kind" | "status" | "projectId"> & Pick<ItemWithRelations, "tags">;

/**
 * Filtering normally happens in SQL. This exists for the one case where it
 * cannot: a full-text search has already ranked its results, and re-querying to
 * narrow them would throw that ranking away.
 */
export function matchesItemFilters(item: FilterableItem, filters: ItemFilters): boolean {
  if (filters.kinds && !filters.kinds.includes(item.kind)) return false;
  if (filters.statuses && !filters.statuses.includes(item.status)) return false;
  if (filters.projectId && item.projectId !== filters.projectId) return false;
  if (filters.tagName && !item.tags.some((tag) => tag.name === filters.tagName)) return false;
  return true;
}

/**
 * Filters as they appear in a URL.
 *
 * Two pseudo-values exist alongside the real enum values: "open" (everything
 * that still wants attention) and "all". They live here rather than in a page
 * so the URL contract has one definition and can be tested.
 */

export const STATUS_FILTERS = [
  "open",
  "inbox",
  "active",
  "someday",
  "done",
  "archived",
  "all",
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export type KindFilter = ItemKind | "all";

export function parseStatusFilter(value: string | undefined, fallback: StatusFilter): StatusFilter {
  return value !== undefined && (STATUS_FILTERS as readonly string[]).includes(value)
    ? (value as StatusFilter)
    : fallback;
}

export function statusesForFilter(filter: StatusFilter): readonly ItemStatus[] | undefined {
  if (filter === "all") return undefined;
  if (filter === "open") return OPEN_ITEM_STATUSES;
  return [filter];
}

export function parseKindFilter(value: string | undefined, fallback: KindFilter): KindFilter {
  if (value === "all") return "all";
  if (value !== undefined && isItemKind(value)) return value;
  return fallback;
}

export function kindsForFilter(filter: KindFilter): readonly ItemKind[] | undefined {
  return filter === "all" ? undefined : [filter];
}
