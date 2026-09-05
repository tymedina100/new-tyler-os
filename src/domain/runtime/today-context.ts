import type { KitchenLocation } from "@/domain/kitchen/inventory";
import type { IsoDate } from "@/domain/shared/date";

/**
 * What a runtime may read about Today.
 *
 * Titles and dates only. Item bodies, kitchen notes, and project names stay
 * off this DTO — observe means enough to brief, not a dump of personal prose.
 */

export interface TodayContextItem {
  id: string;
  title: string;
  dueOn: IsoDate | null;
}

export interface TodayContextFood {
  id: string;
  name: string;
  location: KitchenLocation;
  expiresOn: IsoDate | null;
}

export interface TodayContext {
  today: IsoDate;
  overdue: TodayContextItem[];
  dueToday: TodayContextItem[];
  upcoming: TodayContextItem[];
  needsTriage: TodayContextItem[];
  expiringSoon: TodayContextFood[];
}

/** Same material rule the Python worker uses. One weird record must not explode context. */
export const MAX_TODAY_CONTEXT_ITEMS = 12;
export const MAX_TODAY_CONTEXT_TITLE = 160;

const MATERIAL_ITEM_KEYS = ["overdue", "dueToday", "needsTriage", "upcoming"] as const;

export function todayHasMaterial(context: TodayContext): boolean {
  for (const key of MATERIAL_ITEM_KEYS) {
    if (context[key].some((item) => item.title.trim().length > 0)) return true;
  }
  return context.expiringSoon.some((item) => item.name.trim().length > 0);
}

export function boundTodayContext(context: TodayContext): TodayContext {
  return {
    today: context.today,
    overdue: boundItems(context.overdue),
    dueToday: boundItems(context.dueToday),
    upcoming: boundItems(context.upcoming),
    needsTriage: boundItems(context.needsTriage),
    expiringSoon: context.expiringSoon.slice(0, MAX_TODAY_CONTEXT_ITEMS).map((item) => ({
      ...item,
      name: clip(item.name),
    })),
  };
}

function boundItems(items: readonly TodayContextItem[]): TodayContextItem[] {
  return items.slice(0, MAX_TODAY_CONTEXT_ITEMS).map((item) => ({
    ...item,
    title: clip(item.title),
  }));
}

function clip(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= MAX_TODAY_CONTEXT_TITLE
    ? trimmed
    : `${trimmed.slice(0, MAX_TODAY_CONTEXT_TITLE - 1)}…`;
}
