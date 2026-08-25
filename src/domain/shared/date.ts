/**
 * Calendar-date helpers.
 *
 * TylerOS stores due dates as calendar dates, not instants. "Pay the electric
 * bill Friday" is a day, not a moment, and modelling it as a timestamp only
 * imports timezone bugs. Dates are interpreted in the local timezone of
 * whatever machine renders them, which is correct for a single-user system.
 *
 * Every function takes the current time explicitly so behaviour is testable
 * without freezing the clock.
 */

/** A calendar date in `YYYY-MM-DD` form. */
export type IsoDate = string;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = fromIsoDate(value);
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === value;
}

/** Formats a `Date` as a calendar date using its local components. */
export function toIsoDate(date: Date): IsoDate {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses a calendar date into local midnight. */
export function fromIsoDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? NaN, (month ?? NaN) - 1, day ?? NaN);
}

export function todayIsoDate(now: Date): IsoDate {
  return toIsoDate(now);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const diff = fromIsoDate(to).getTime() - fromIsoDate(from).getTime();
  return Math.round(diff / millisecondsPerDay);
}

/** Calendar dates sort correctly as strings, which keeps comparisons cheap. */
export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Human label for a due date, relative to today.
 * Deliberately not `Intl`-based: the output is asserted in tests and should not
 * shift with the host locale.
 */
export function formatDueDate(dueOn: IsoDate, today: IsoDate): string {
  const offset = daysBetween(today, dueOn);

  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  if (offset < -1 && offset >= -7) return `${Math.abs(offset)} days ago`;
  if (offset > 1 && offset <= 6) {
    return WEEKDAY_NAMES[fromIsoDate(dueOn).getDay()] ?? dueOn;
  }

  const date = fromIsoDate(dueOn);
  const month = MONTH_NAMES[date.getMonth()] ?? "";
  const label = `${month} ${date.getDate()}`;
  return date.getFullYear() === fromIsoDate(today).getFullYear()
    ? label
    : `${label}, ${date.getFullYear()}`;
}

const MONTH_FULL_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "August 24" - a day without its weekday, for when the weekday is elsewhere. */
export function formatMonthDay(iso: IsoDate): string {
  const date = fromIsoDate(iso);
  const month = MONTH_FULL_NAMES[date.getMonth()] ?? "";
  return `${month} ${date.getDate()}`;
}

/** "Monday, August 24" - the heading form, used by the Today screen. */
export function formatLongDate(iso: IsoDate): string {
  const date = fromIsoDate(iso);
  const weekday = WEEKDAY_NAMES[date.getDay()] ?? "";
  return `${weekday}, ${formatMonthDay(iso)}`;
}

/**
 * Adds whole months, clamping to the last day of the target month.
 *
 * January 31st plus one month is February 28th, because February has no 31st
 * and "the 31st" is the only thing the user said. `Date` itself would roll that
 * over into March 3rd, which is a different month entirely.
 *
 * Clamping only stays honest because callers count months from a fixed anchor
 * rather than from the previous result — see src/domain/recurrence/.
 */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const date = fromIsoDate(iso);
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);

  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return toIsoDate(target);
}

/** Day zero of the following month is the last day of this one. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Whole months from `from` to `to`, ignoring the day of the month. */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const start = fromIsoDate(from);
  const end = fromIsoDate(to);
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

/** Sunday = 0, matching `Date.getDay()`. */
export function weekdayOf(iso: IsoDate): number {
  return fromIsoDate(iso).getDay();
}

export function weekdayName(iso: IsoDate): string {
  return WEEKDAY_NAMES[weekdayOf(iso)] ?? "";
}

/** "1st", "2nd", "23rd" — the day of the month as it is said aloud. */
export function ordinalDayOfMonth(iso: IsoDate): string {
  const day = fromIsoDate(iso).getDate();
  const remainderTen = day % 10;
  const remainderHundred = day % 100;

  if (remainderTen === 1 && remainderHundred !== 11) return `${day}st`;
  if (remainderTen === 2 && remainderHundred !== 12) return `${day}nd`;
  if (remainderTen === 3 && remainderHundred !== 13) return `${day}rd`;
  return `${day}th`;
}
