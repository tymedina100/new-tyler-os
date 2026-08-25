import { type IsoDate, ordinalDayOfMonth, weekdayName } from "@/domain/shared/date";

/**
 * Recurrence: the responsibilities that come back.
 *
 * Bins on Tuesday, sheets every fortnight, rent on the 1st. A recurring
 * responsibility is still one Item — completing it completes the current
 * occurrence and moves the item to the next one. There is no table of future
 * occurrences, because a schedule with no end cannot be stored as rows. See
 * ADR 022.
 *
 * The model is deliberately two fields wide: a frequency and an interval,
 * counted from an anchor date. Everything the milestone asked for falls out of
 * that, because **the anchor carries the rest of the meaning**:
 *
 *   every Tuesday          weekly,  interval 1, anchored on a Tuesday
 *   every other Saturday   weekly,  interval 2, anchored on a Saturday
 *   rent on the 1st        monthly, interval 1, anchored on a 1st
 *   air filter quarterly   monthly, interval 3, anchored on the day it was done
 *
 * That is why there is no weekday column and no day-of-month column, and why
 * this is not an RFC 5545 engine. Nothing here can express "the third weekday
 * of the month unless it is a holiday", and nothing here should.
 */

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

/**
 * An interval is a small number of periods. The cap is not a storage limit; it
 * is a statement that "every 250 weeks" is a date, not a habit.
 */
export const MAX_RECURRENCE_INTERVAL = 99;

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
}

export interface ItemRecurrence extends RecurrenceRule {
  /**
   * The origin of the series. Every occurrence is counted from here rather
   * than from the previous one, which is what stops a clamped monthly date
   * (January 31st landing on February 28th) from dragging the whole schedule
   * backwards. See `occurrenceOn`.
   */
  anchorOn: IsoDate;
  /**
   * When the most recent occurrence was actually done. One fact, not a log:
   * "when did I last change the filter" is worth answering, "how long is my
   * streak" is a different product.
   */
  lastCompletedOn: IsoDate | null;
}

/** The short form, for a badge beside a due date. */
export function summarizeRecurrence(rule: RecurrenceRule): string {
  if (rule.interval === 1) return RECURRENCE_FREQUENCY_LABELS[rule.frequency];
  return `Every ${rule.interval} ${pluralPeriod(rule.frequency, rule.interval)}`;
}

/**
 * The long form, which names the day the schedule actually falls on.
 *
 * "Every 2 weeks" is ambiguous in a way that matters — the user needs to see
 * *which* Tuesday before trusting it, so the anchor is spelled out.
 */
export function describeRecurrence(recurrence: ItemRecurrence): string {
  const { frequency, interval, anchorOn } = recurrence;

  if (frequency === "daily") {
    return interval === 1 ? "Every day" : `Every ${interval} days`;
  }

  if (frequency === "weekly") {
    const weekday = weekdayName(anchorOn);
    return interval === 1 ? `Every ${weekday}` : `Every ${interval} weeks on ${weekday}`;
  }

  const day = ordinalDayOfMonth(anchorOn);
  return interval === 1 ? `Monthly on the ${day}` : `Every ${interval} months on the ${day}`;
}

function pluralPeriod(frequency: RecurrenceFrequency, interval: number): string {
  const singular = frequency === "daily" ? "day" : frequency === "weekly" ? "week" : "month";
  return interval === 1 ? singular : `${singular}s`;
}

export function isRecurrenceFrequency(value: string): value is RecurrenceFrequency {
  return (RECURRENCE_FREQUENCIES as readonly string[]).includes(value);
}

/**
 * The repeats offered as one click from a row menu.
 *
 * Not the whole of what the model can express — the item editor covers that.
 * These are the ones worth reaching without opening anything, and they are the
 * five shapes the milestone was actually about.
 */
export const RECURRENCE_PRESETS = [
  { label: "Daily", frequency: "daily", interval: 1 },
  { label: "Weekly", frequency: "weekly", interval: 1 },
  { label: "Every 2 weeks", frequency: "weekly", interval: 2 },
  { label: "Monthly", frequency: "monthly", interval: 1 },
  { label: "Every 3 months", frequency: "monthly", interval: 3 },
] as const satisfies readonly (RecurrenceRule & { label: string })[];
