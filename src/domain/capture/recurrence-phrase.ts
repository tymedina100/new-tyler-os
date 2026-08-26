import { comingWeekday, weekdayIndex } from "@/domain/capture/date-phrase";
import type { RecurrenceRule } from "@/domain/recurrence/recurrence";
import { MAX_RECURRENCE_INTERVAL } from "@/domain/recurrence/recurrence";
import type { IsoDate } from "@/domain/shared/date";

/**
 * Deterministic repeat phrases for the capture bar.
 *
 * "take trash out every tuesday" should file itself as a repeating
 * responsibility, for the same reason "pay bill friday" files itself with a
 * date: a system you have to go back and configure is a system you stop using.
 *
 * This is the sibling of `date-phrase.ts` and it borrows both of that module's
 * safety rules, because they are what make guessing acceptable at all:
 *
 * 1. **Only a trailing phrase counts.** "read Every Day by David Levithan" is a
 *    book, not a daily habit — the words are there, but they are not at the end,
 *    so nothing is taken. This single rule removes almost every false positive.
 * 2. **Nothing is resolved against an ambient clock.** The reference date is an
 *    argument, so the same text always parses to the same schedule.
 *
 * And one rule of its own: **anything outside the grammar stays in the title.**
 * "every full moon", "twice a week", "last friday of the month" and "every 0
 * weeks" are all left exactly as typed. A capture that quietly became the wrong
 * schedule is worse than one that became no schedule, because nobody re-reads
 * an item that already looks filed.
 */

/** The words that mean a period, singular and plural, as people type them. */
const PERIODS = {
  day: "daily",
  days: "daily",
  week: "weekly",
  weeks: "weekly",
  month: "monthly",
  months: "monthly",
} as const satisfies Record<string, RecurrenceRule["frequency"]>;

/**
 * One word that is a whole schedule.
 *
 * "fortnightly" is here because it is unambiguous. "biweekly" deliberately is
 * not: it means both twice a week and every two weeks depending on who is
 * saying it, and a schedule nobody can predict is worse than one word of title.
 */
const BARE_WORDS = {
  daily: { frequency: "daily", interval: 1 },
  weekly: { frequency: "weekly", interval: 1 },
  monthly: { frequency: "monthly", interval: 1 },
  fortnightly: { frequency: "weekly", interval: 2 },
} as const satisfies Record<string, RecurrenceRule>;

export interface RecurrencePhraseMatch {
  rule: RecurrenceRule;
  /**
   * The date the phrase itself named, when it named one. "every tuesday" knows
   * which day it means; "monthly" does not, and leaves the anchor to the caller.
   */
  anchorOn: IsoDate | null;
  /** The input with the repeat phrase removed. May be empty. */
  rest: string;
}

/**
 * Finds a repeat phrase at the end of `text`.
 *
 * Returns `null` when the tail is not one, which is the overwhelmingly common
 * case and must stay cheap.
 */
export function matchTrailingRecurrencePhrase(
  text: string,
  today: IsoDate,
): RecurrencePhraseMatch | null {
  const words = text.split(/\s+/).filter((word) => word.length > 0);

  // Longest phrase first, so "every 2 weeks" is never read as bare "weeks".
  for (const size of [3, 2, 1]) {
    if (size > words.length) continue;

    const tail = words.slice(words.length - size).map(normalizeWord);
    const match = resolvePhrase(tail, today);
    if (match === null) continue;

    return { ...match, rest: words.slice(0, words.length - size).join(" ") };
  }

  return null;
}

/** Trailing punctuation is typing, not meaning: "water plants daily." parses. */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[.,;:!?]+$/, "");
}

type ResolvedPhrase = Pick<RecurrencePhraseMatch, "rule" | "anchorOn">;

function resolvePhrase(words: readonly string[], today: IsoDate): ResolvedPhrase | null {
  const [first, second, third] = words;

  if (words.length === 1 && first !== undefined) {
    const rule = BARE_WORDS[first as keyof typeof BARE_WORDS];
    return rule === undefined ? null : { rule: { ...rule }, anchorOn: null };
  }

  if (words.length === 2 && first !== undefined && second !== undefined) {
    if (first !== "every") return null;
    return resolveEveryPair(second, today);
  }

  if (words.length === 3 && first === "every" && second !== undefined && third !== undefined) {
    // "every other week" is the way people say an interval of two.
    if (second === "other") {
      const frequency = PERIODS[third as keyof typeof PERIODS];
      return frequency === undefined ? null : { rule: { frequency, interval: 2 }, anchorOn: null };
    }

    return resolveEveryCount(second, third);
  }

  return null;
}

/** "every day", "every week", "every month", "every tuesday". */
function resolveEveryPair(word: string, today: IsoDate): ResolvedPhrase | null {
  const frequency = PERIODS[word as keyof typeof PERIODS];
  if (frequency !== undefined) {
    return { rule: { frequency, interval: 1 }, anchorOn: null };
  }

  // A named day carries its own anchor, and it is resolved by exactly the same
  // function a bare trailing "tuesday" uses — including counting today as valid.
  const weekday = weekdayIndex(word);
  if (weekday === null) return null;

  return {
    rule: { frequency: "weekly", interval: 1 },
    anchorOn: comingWeekday(weekday, today),
  };
}

/**
 * "every 2 weeks", "every 3 months".
 *
 * An interval outside what the domain will accept is not clamped into range —
 * it is refused, and the words stay in the title. Clamping "every 500 days" to
 * 99 would invent a schedule the user never asked for.
 */
function resolveEveryCount(amount: string, period: string): ResolvedPhrase | null {
  if (!/^\d{1,3}$/.test(amount)) return null;

  const frequency = PERIODS[period as keyof typeof PERIODS];
  if (frequency === undefined) return null;

  const interval = Number(amount);
  if (interval < 1 || interval > MAX_RECURRENCE_INTERVAL) return null;

  return { rule: { frequency, interval }, anchorOn: null };
}
