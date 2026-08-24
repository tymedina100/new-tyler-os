import { isOpenStatus, type Item } from "@/domain/items/item";
import { addDays, compareIsoDate, type IsoDate } from "@/domain/shared/date";

/**
 * The Today view is the one screen that must answer "what actually matters
 * right now" without being read as a to-do list dump.
 *
 * Every open item lands in exactly one bucket. Duplication across buckets is
 * what turns a dashboard into noise, so priority is explicit:
 *
 *   overdue > due today > upcoming (next 7 days) > needs triage
 *
 * Items with no date that have already been triaged are intentionally absent:
 * they live on their module page, not on Today.
 */

export const UPCOMING_WINDOW_DAYS = 7;

type TodayItem = Pick<Item, "status" | "dueOn" | "createdAt">;

export interface TodayView<T extends TodayItem> {
  overdue: T[];
  dueToday: T[];
  upcoming: T[];
  needsTriage: T[];
  totalSurfaced: number;
}

export function buildTodayView<T extends TodayItem>(
  items: readonly T[],
  today: IsoDate,
): TodayView<T> {
  const horizon = addDays(today, UPCOMING_WINDOW_DAYS);

  const overdue: T[] = [];
  const dueToday: T[] = [];
  const upcoming: T[] = [];
  const needsTriage: T[] = [];

  for (const item of items) {
    if (!isOpenStatus(item.status)) continue;

    if (item.dueOn !== null) {
      const comparedToToday = compareIsoDate(item.dueOn, today);

      if (comparedToToday < 0) {
        overdue.push(item);
        continue;
      }
      if (comparedToToday === 0) {
        dueToday.push(item);
        continue;
      }
      if (compareIsoDate(item.dueOn, horizon) <= 0) {
        upcoming.push(item);
        continue;
      }
    }

    if (item.status === "inbox") {
      needsTriage.push(item);
    }
  }

  overdue.sort(byDueDateThenAge);
  dueToday.sort(byDueDateThenAge);
  upcoming.sort(byDueDateThenAge);
  // Newest first: you triage what you just captured while it is still in mind.
  needsTriage.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    overdue,
    dueToday,
    upcoming,
    needsTriage,
    totalSurfaced: overdue.length + dueToday.length + upcoming.length + needsTriage.length,
  };
}

function byDueDateThenAge(a: TodayItem, b: TodayItem): number {
  const byDate = compareIsoDate(a.dueOn ?? "", b.dueOn ?? "");
  if (byDate !== 0) return byDate;
  return a.createdAt.getTime() - b.createdAt.getTime();
}
