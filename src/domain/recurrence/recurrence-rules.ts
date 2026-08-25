import type { ItemRecurrence } from "@/domain/recurrence/recurrence";
import {
  addDays,
  addMonths,
  compareIsoDate,
  daysBetween,
  type IsoDate,
  monthsBetween,
} from "@/domain/shared/date";
import { DomainError } from "@/domain/shared/errors";

/**
 * When a recurring responsibility is next due.
 *
 * Every function here is pure and takes its reference date as an argument, like
 * the rest of the domain. A schedule that reads the clock cannot be tested in
 * November for what it does in August, and this is the one part of TylerOS
 * where being quietly wrong about a date costs the user a missed bin day.
 *
 * The rule the whole file rests on: **occurrences are counted from the anchor,
 * never from the previous occurrence.** Stepping forward one period at a time
 * accumulates the monthly clamp — January 31st becomes February 28th becomes
 * March 28th, and by June the schedule has silently moved. Counting from the
 * anchor gives January 31st, February 28th, March 31st.
 */

/** Clamping can only move a date by a few days, so the walk is always short. */
const MAX_CLAMP_STEPS = 12;

/** The date of the `index`-th occurrence, where index 0 is the anchor itself. */
export function occurrenceOn(recurrence: ItemRecurrence, index: number): IsoDate {
  if (!Number.isInteger(index) || index < 0) {
    throw new DomainError("conflict", "An occurrence index must be a whole number from zero.");
  }

  const steps = index * recurrence.interval;

  switch (recurrence.frequency) {
    case "daily":
      return addDays(recurrence.anchorOn, steps);
    case "weekly":
      return addDays(recurrence.anchorOn, steps * 7);
    case "monthly":
      return addMonths(recurrence.anchorOn, steps);
  }
}

/**
 * The first occurrence strictly after `after`.
 *
 * Strictly, because the occurrence being completed must not be handed back as
 * its own successor — that is the difference between "bins done, next Tuesday"
 * and an item that never moves.
 */
export function nextOccurrenceAfter(recurrence: ItemRecurrence, after: IsoDate): IsoDate {
  if (compareIsoDate(recurrence.anchorOn, after) > 0) return recurrence.anchorOn;

  return occurrenceOn(recurrence, firstIndexAfter(recurrence, after));
}

/**
 * Every occurrence inside a window, inclusive at both ends.
 *
 * This is what lets a two-week view show the bins on both Tuesdays without a
 * single future row existing. `limit` is a guard, not a feature: a daily
 * schedule over a long window would otherwise build a list nobody reads.
 */
export function occurrencesBetween(
  recurrence: ItemRecurrence,
  from: IsoDate,
  to: IsoDate,
  limit = 64,
): IsoDate[] {
  if (compareIsoDate(from, to) > 0) return [];

  const dates: IsoDate[] = [];
  let index =
    compareIsoDate(recurrence.anchorOn, from) >= 0
      ? 0
      : firstIndexAfter(recurrence, addDays(from, -1));

  while (dates.length < limit) {
    const date = occurrenceOn(recurrence, index);
    if (compareIsoDate(date, to) > 0) break;
    if (compareIsoDate(date, from) >= 0) dates.push(date);
    index += 1;
  }

  return dates;
}

/** What changes about a recurring item when its current occurrence is settled. */
export interface RecurrencePatch {
  dueOn: IsoDate;
  lastCompletedOn: IsoDate | null;
}

/**
 * Completing the current occurrence.
 *
 * The next date is the next one **on the schedule**, not a period counted from
 * the moment of completion. Taking the bins out on Thursday because Tuesday was
 * missed does not move bin day to Thursday; that is the single most important
 * behaviour in this milestone, and the reason recurrence is anchored at all.
 *
 * Missing several periods does not queue them up either. The next occurrence is
 * the next one in the future, so three skipped weeks cost one late completion
 * rather than three phantom ones.
 */
export function completeOccurrence(
  recurrence: ItemRecurrence,
  dueOn: IsoDate,
  completedOn: IsoDate,
): RecurrencePatch {
  return {
    dueOn: nextOccurrenceAfter(recurrence, laterOf(dueOn, completedOn)),
    lastCompletedOn: completedOn,
  };
}

/**
 * Letting one go by without doing it.
 *
 * Deliberately not the same as completing: nothing was done, so the last-done
 * date is left alone. Without this the only way to clear an overdue repeat you
 * genuinely skipped is to claim you did it, and an inventory of lies is the
 * failure mode this whole system is built against.
 */
export function skipOccurrence(
  recurrence: ItemRecurrence,
  dueOn: IsoDate,
  today: IsoDate,
): RecurrencePatch {
  return {
    dueOn: nextOccurrenceAfter(recurrence, laterOf(dueOn, today)),
    lastCompletedOn: recurrence.lastCompletedOn,
  };
}

/**
 * The occurrence a new schedule starts from.
 *
 * A recurring item always has a due date — it is the current occurrence, and a
 * schedule with no current occurrence is not a schedule. An item that already
 * has a date keeps it, including an overdue one: making something repeat is not
 * an admission that it is no longer late.
 */
export function startingOccurrence(dueOn: IsoDate | null, today: IsoDate): IsoDate {
  return dueOn ?? today;
}

/**
 * Where the series counts from after an edit.
 *
 * The anchor moves only when the due date is deliberately changed. Saving the
 * item editor without touching the date must not re-anchor, or a monthly repeat
 * that has legitimately clamped to February 28th would quietly become "the
 * 28th" forever.
 */
export function resolveAnchor(
  existing: { anchorOn: IsoDate; dueOn: IsoDate | null } | null,
  dueOn: IsoDate,
): IsoDate {
  if (existing === null) return dueOn;
  return existing.dueOn === dueOn ? existing.anchorOn : dueOn;
}

function laterOf(a: IsoDate, b: IsoDate): IsoDate {
  return compareIsoDate(a, b) >= 0 ? a : b;
}

/**
 * The index of the first occurrence strictly after `after`, assuming the anchor
 * is not itself later than it.
 *
 * Daily and weekly are exact arithmetic. Monthly starts from the arithmetic
 * guess and walks, because a clamped month can put an occurrence a day or three
 * off the naive answer; the walk is bounded so a bug here fails loudly rather
 * than hanging a request.
 */
function firstIndexAfter(recurrence: ItemRecurrence, after: IsoDate): number {
  const { frequency, interval, anchorOn } = recurrence;

  if (frequency === "daily" || frequency === "weekly") {
    const periodDays = interval * (frequency === "weekly" ? 7 : 1);
    return Math.floor(daysBetween(anchorOn, after) / periodDays) + 1;
  }

  const guess = Math.floor(monthsBetween(anchorOn, after) / interval);
  let index = Math.max(guess - 1, 0);

  for (let step = 0; step <= MAX_CLAMP_STEPS; step += 1) {
    if (compareIsoDate(occurrenceOn(recurrence, index), after) > 0) return index;
    index += 1;
  }

  throw new DomainError(
    "conflict",
    "Could not work out when this repeats next. The schedule looks wrong.",
  );
}
