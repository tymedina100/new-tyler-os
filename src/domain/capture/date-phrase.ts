import { addDays, fromIsoDate, isIsoDate, type IsoDate, toIsoDate } from "@/domain/shared/date";

/**
 * Deterministic date phrases for the capture bar.
 *
 * "pay electric bill friday" should file itself. That is worth a small parser;
 * it is not worth a natural-language understanding system, and it is certainly
 * not worth a dependency. The rules here are the ones people actually type, and
 * anything outside them is left alone rather than guessed at.
 *
 * Two deliberate restrictions keep this safe to run on every capture:
 *
 * 1. **Only a trailing phrase counts.** "monday meeting notes" is a note about a
 *    meeting, not something due on Monday. Dates go at the end, where people put
 *    them anyway, and everything else keeps its words.
 * 2. **Nothing is resolved relative to an ambient clock.** The reference date is
 *    an argument, so the same input always produces the same output.
 */

/** Monday-based, matching the order people say the week in. */
const WEEKDAYS = [
  { full: "monday", short: "mon" },
  { full: "tuesday", short: "tue" },
  { full: "wednesday", short: "wed" },
  { full: "thursday", short: "thu" },
  { full: "friday", short: "fri" },
  { full: "saturday", short: "sat" },
  { full: "sunday", short: "sun" },
] as const;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const SATURDAY_INDEX = 5;
const SUNDAY_INDEX = 6;

/** Words that introduce a date without adding meaning: "pay the bill by friday". */
const LEADING_PREPOSITIONS = ["on", "by", "due"] as const;

export interface DatePhraseMatch {
  dueOn: IsoDate;
  /** The input with the date phrase removed. May be empty. */
  rest: string;
}

/**
 * Finds a date phrase at the end of `text`.
 *
 * Returns `null` when the tail is not a date, which is the common case and must
 * stay cheap.
 */
export function matchTrailingDatePhrase(text: string, today: IsoDate): DatePhraseMatch | null {
  const words = text.split(/\s+/).filter((word) => word.length > 0);

  // Longest phrase first, so "next weekend" is not read as bare "weekend".
  for (const size of [4, 3, 2, 1]) {
    if (size > words.length) continue;

    const tail = words.slice(words.length - size);
    const dueOn = resolvePhrase(tail.map(normalizeWord), today);
    if (dueOn === null) continue;

    return { dueOn, rest: words.slice(0, words.length - size).join(" ") };
  }

  return null;
}

/** Trailing punctuation is typing, not meaning: "pay bill friday." still parses. */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[.,;:!?]+$/, "");
}

function resolvePhrase(words: readonly string[], today: IsoDate): IsoDate | null {
  const withoutPreposition =
    words.length > 1 && (LEADING_PREPOSITIONS as readonly string[]).includes(words[0] ?? "")
      ? words.slice(1)
      : words;

  if (withoutPreposition.length === 0) return null;
  return resolveDatePhrase(withoutPreposition, today);
}

function resolveDatePhrase(words: readonly string[], today: IsoDate): IsoDate | null {
  const [first, second, third] = words;

  if (words.length === 1 && first !== undefined) {
    return resolveSingleWord(first, today);
  }

  if (words.length === 2 && first !== undefined && second !== undefined) {
    return resolveTwoWords(first, second, today);
  }

  if (words.length === 3 && first !== undefined && second !== undefined && third !== undefined) {
    // "in 3 days" / "in 2 weeks"
    if (first === "in") return resolveRelativeSpan(second, third, today);
    // "september 3 2026"
    return resolveMonthDay(first, second, third, today);
  }

  return null;
}

function resolveSingleWord(word: string, today: IsoDate): IsoDate | null {
  if (word === "today" || word === "tonight") return today;
  if (word === "tomorrow") return addDays(today, 1);
  if (isIsoDate(word)) return word;

  const weekday = weekdayIndex(word);
  return weekday === null ? null : comingWeekday(weekday, today);
}

function resolveTwoWords(first: string, second: string, today: IsoDate): IsoDate | null {
  if (first === "next") {
    if (second === "week") return startOfNextWeek(today);
    if (second === "weekend") return addDays(startOfNextWeek(today), SATURDAY_INDEX);

    const weekday = weekdayIndex(second);
    return weekday === null ? null : addDays(startOfNextWeek(today), weekday);
  }

  if (first === "this") {
    if (second === "weekend") return comingWeekend(today);

    const weekday = weekdayIndex(second);
    return weekday === null ? null : comingWeekday(weekday, today);
  }

  return resolveMonthDay(first, second, undefined, today);
}

function resolveRelativeSpan(amount: string, unit: string, today: IsoDate): IsoDate | null {
  if (!/^\d{1,3}$/.test(amount)) return null;

  const count = Number(amount);
  if (unit === "day" || unit === "days") return addDays(today, count);
  if (unit === "week" || unit === "weeks") return addDays(today, count * 7);
  return null;
}

/** "september 3", "sep 3rd", and the same with a four-digit year. */
function resolveMonthDay(
  monthWord: string,
  dayWord: string,
  yearWord: string | undefined,
  today: IsoDate,
): IsoDate | null {
  const month = monthIndex(monthWord);
  if (month === null) return null;

  if (!/^\d{1,2}(st|nd|rd|th)?$/.test(dayWord)) return null;
  const day = Number(dayWord.replace(/\D/g, ""));

  if (yearWord !== undefined) {
    return /^\d{4}$/.test(yearWord) ? buildDate(Number(yearWord), month, day) : null;
  }

  // Without a year, "september 3" means the next one. Typing it in December
  // should not silently file something nine months into the past.
  const thisYear = fromIsoDate(today).getFullYear();
  const candidate = buildDate(thisYear, month, day);
  if (candidate === null) return null;
  return candidate >= today ? candidate : buildDate(thisYear + 1, month, day);
}

/** Rejects dates the calendar does not have, so "february 31" stays as text. */
function buildDate(year: number, month: number, day: number): IsoDate | null {
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return toIsoDate(date);
}

/**
 * Exported for `recurrence-phrase.ts`, so "every tuesday" and a bare "tuesday"
 * cannot come to disagree about which Tuesday they mean. Monday = 0.
 */
export function weekdayIndex(word: string): number | null {
  const index = WEEKDAYS.findIndex(({ full, short }) => word === full || word === short);
  return index === -1 ? null : index;
}

function monthIndex(word: string): number | null {
  const index = MONTHS.findIndex((name) => word === name || word === name.slice(0, 3));
  return index === -1 ? null : index;
}

/** Monday = 0, matching WEEKDAYS. */
function mondayBasedDay(iso: IsoDate): number {
  return (fromIsoDate(iso).getDay() + 6) % 7;
}

/**
 * The next occurrence of a weekday, counting today as valid. Saying "friday" on
 * a Friday means today, not a week away.
 */
export function comingWeekday(weekday: number, today: IsoDate): IsoDate {
  const offset = (weekday - mondayBasedDay(today) + 7) % 7;
  return addDays(today, offset);
}

/** The Monday that begins the following week. */
function startOfNextWeek(today: IsoDate): IsoDate {
  return addDays(today, 7 - mondayBasedDay(today));
}

/** Saturday, unless it is already Sunday — in which case the weekend is now. */
function comingWeekend(today: IsoDate): IsoDate {
  return mondayBasedDay(today) === SUNDAY_INDEX ? today : comingWeekday(SATURDAY_INDEX, today);
}
