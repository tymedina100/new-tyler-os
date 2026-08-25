import { isOpenStatus, type Item } from "@/domain/items/item";
import type { InventoryItem } from "@/domain/kitchen/inventory";
import type { ItemRecurrence } from "@/domain/recurrence/recurrence";
import { occurrencesBetween } from "@/domain/recurrence/recurrence-rules";
import { addDays, compareIsoDate, type IsoDate } from "@/domain/shared/date";

/**
 * What matters on the days ahead.
 *
 * TylerOS now has more than one kind of thing that happens on a date: an item
 * is due, a repeat comes round, a packet of chicken goes off. They are genuinely
 * different — one is a responsibility, one is a fact about the fridge — and
 * flattening them into a single `events` table would make the fridge a to-do
 * list. See ADR 023.
 *
 * So this is a **projection, not a model**. Each day holds one named list per
 * domain, each list keeps its own type, and no source knows about any other. A
 * fourth time-bearing domain adds a fourth named list here and changes nothing
 * anywhere else; only when there are enough of them to be tedious would a
 * generalisation have earned itself.
 *
 * Days with nothing on them are left out entirely. A grid of empty cells is a
 * calendar, and a calendar is the thing this milestone deliberately is not.
 */

export const AGENDA_WINDOW_DAYS = 14;

/** Only the fields the projection reads, so any richer item shape fits. */
type AgendaItem = Pick<Item, "status" | "dueOn"> & { recurrence: ItemRecurrence | null };
type AgendaFood = Pick<InventoryItem, "expiresOn">;

export interface AgendaDay<TItem, TFood> {
  date: IsoDate;
  /** Items whose current occurrence — or only occurrence — is this day. */
  items: TItem[];
  /**
   * Recurring items that will come round again on this day. Computed, never
   * stored, and never actionable: completing a repeat that has not arrived yet
   * would be completing the wrong occurrence.
   */
  repeats: TItem[];
  expiring: TFood[];
  total: number;
}

export interface Agenda<TItem, TFood> {
  from: IsoDate;
  to: IsoDate;
  days: AgendaDay<TItem, TFood>[];
  totalSurfaced: number;
}

export function buildAgenda<TItem extends AgendaItem, TFood extends AgendaFood>(
  sources: { items: readonly TItem[]; expiring: readonly TFood[] },
  window: { from: IsoDate; days: number },
): Agenda<TItem, TFood> {
  const to = addDays(window.from, Math.max(window.days - 1, 0));
  const byDate = new Map<IsoDate, AgendaDay<TItem, TFood>>();

  function dayFor(date: IsoDate): AgendaDay<TItem, TFood> | null {
    if (compareIsoDate(date, window.from) < 0 || compareIsoDate(date, to) > 0) return null;

    const existing = byDate.get(date);
    if (existing) return existing;

    const created: AgendaDay<TItem, TFood> = {
      date,
      items: [],
      repeats: [],
      expiring: [],
      total: 0,
    };
    byDate.set(date, created);
    return created;
  }

  for (const item of sources.items) {
    if (!isOpenStatus(item.status)) continue;
    if (item.dueOn === null) continue;

    dayFor(item.dueOn)?.items.push(item);

    if (item.recurrence === null) continue;

    // The current occurrence is already listed above; everything after it is a
    // projection of a row that does not exist yet.
    for (const date of occurrencesBetween(item.recurrence, window.from, to, window.days)) {
      if (date === item.dueOn) continue;
      dayFor(date)?.repeats.push(item);
    }
  }

  for (const food of sources.expiring) {
    if (food.expiresOn === null) continue;
    dayFor(food.expiresOn)?.expiring.push(food);
  }

  const days = [...byDate.values()]
    .map((day) => ({ ...day, total: day.items.length + day.repeats.length + day.expiring.length }))
    .filter((day) => day.total > 0)
    .sort((a, b) => compareIsoDate(a.date, b.date));

  return {
    from: window.from,
    to,
    days,
    totalSurfaced: days.reduce((sum, day) => sum + day.total, 0),
  };
}
