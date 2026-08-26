import { matchTrailingDatePhrase } from "@/domain/capture/date-phrase";
import { matchProjectRef } from "@/domain/capture/project-ref";
import { matchTrailingRecurrencePhrase } from "@/domain/capture/recurrence-phrase";
import type { ProjectRef } from "@/domain/projects/project";
import { startingOccurrence } from "@/domain/recurrence/recurrence-rules";
import type { RecurrenceRule } from "@/domain/recurrence/recurrence";
import type { IsoDate } from "@/domain/shared/date";
import { normalizeTagNames } from "@/domain/tags/tag";

/**
 * Capture parsing.
 *
 * Capture must cost nothing. Typing "pay electric bill friday @Home #finance"
 * should file the item completely, because organisation that costs keystrokes
 * does not survive contact with real life.
 *
 * This is deterministic string handling, and deliberately so. Given the same
 * text, the same reference date and the same projects, it always produces the
 * same result — which is what lets the capture bar show a live preview that is
 * guaranteed to match what the server will store.
 *
 * The order is fixed: **tags, then `@project`, then a trailing repeat, then a
 * trailing date.** Removing the labelled tokens first is what makes
 * "pay bill friday #finance" and "pay bill #finance friday" the same capture,
 * which is the only behaviour a person typing quickly can predict.
 *
 * The repeat comes before the date because a repeat can end in a date-shaped
 * word: read the other way round, "take trash out every tuesday" loses its
 * Tuesday to the date parser and becomes an item called "take trash out every".
 *
 * A repeat and a date can still arrive in either order, so there is one extra
 * pass: if the first look found no repeat and the date pass consumed something,
 * the repeat is looked for again. That is what makes "report every 2 weeks
 * friday" work alongside "clean fridge tomorrow every month". At most one date
 * and at most one repeat are ever taken — the second pass is deliberately not a
 * loop, because repeatedly stripping dates would change what "meeting friday
 * tomorrow" has always meant.
 */

export interface CaptureContext {
  /** The reference date. Never read from the clock — see the domain rules. */
  today: IsoDate;
  projects: readonly ProjectRef[];
}

export interface UnresolvedProject {
  /** The reference as typed, without the `@`. */
  ref: string;
  reason: "unknown" | "ambiguous";
}

export interface ParsedCapture {
  title: string;
  tags: string[];
  dueOn: IsoDate | null;
  projectId: string | null;
  /**
   * Set when an `@reference` was present but could not be resolved with
   * confidence. The reference stays in the title so the capture is never lost.
   */
  unresolvedProject: UnresolvedProject | null;
  /**
   * How it repeats, if the text said so. When this is set, `dueOn` is never
   * null: it is the first occurrence, and the recurrence anchor. That is the
   * same invariant the item editor holds — a schedule with no current
   * occurrence is not a schedule.
   */
  recurrence: RecurrenceRule | null;
}

/** Matches `#tag` when it starts a word, so URLs and `C#` are left alone. */
const INLINE_TAG_PATTERN = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

/** Matches `@project` when it starts a word, so `tyler@example.com` is not one. */
const INLINE_PROJECT_PATTERN = /(^|\s)@([\p{L}\p{N}][\p{L}\p{N}._-]*)/u;

export function parseCapture(raw: string, context: CaptureContext): ParsedCapture {
  const text = raw.trim();

  const { withoutTags, tags } = extractTags(text);
  const project = extractProject(withoutTags, context.projects);

  // The repeat is looked for before the date, because a repeat can end in a
  // date-shaped word: "every tuesday" would otherwise lose its Tuesday to the
  // date parser and leave a title ending in a stray "every".
  const repeated = extractTrailingRecurrence(project.text, context.today);
  const dated = extractTrailingDate(repeated.text, context.today);

  // "report every 2 weeks friday" hides its repeat behind the date, so look
  // once more now the date is out of the way — but only if the first pass found
  // no repeat and the date pass actually consumed something. Without that guard
  // this would be a loop, and a loop would change what a capture with two dates
  // in it has always meant.
  const rerepeated =
    repeated.rule === null && dated.text !== repeated.text
      ? extractTrailingRecurrence(dated.text, context.today)
      : { ...repeated, text: dated.text };

  const title = collapse(rerepeated.text);
  const rule = repeated.rule ?? rerepeated.rule;

  return {
    // Capturing only metadata is unusual, but must never lose what was typed.
    title: title.length > 0 ? title : text,
    tags,
    // A repeat must have a current occurrence. A date the user actually stated
    // is the anchor; failing that, the day a phrase like "every tuesday" named;
    // failing that, today — which is `startingOccurrence`, the same rule the
    // editor applies when an undated item is made to repeat.
    dueOn:
      rule === null
        ? dated.dueOn
        : startingOccurrence(dated.dueOn ?? rerepeated.anchorOn, context.today),
    projectId: project.projectId,
    unresolvedProject: project.unresolved,
    recurrence: rule,
  };
}

function extractTags(text: string): { withoutTags: string; tags: string[] } {
  const found: string[] = [];

  const withoutTags = text.replace(INLINE_TAG_PATTERN, (_match, leading: string, tag: string) => {
    found.push(tag);
    return leading;
  });

  return { withoutTags, tags: normalizeTagNames(found) };
}

interface ExtractedProject {
  text: string;
  projectId: string | null;
  unresolved: UnresolvedProject | null;
}

/**
 * Only the first `@reference` is treated as the project, because an item belongs
 * to at most one. A second one is left in the title rather than silently
 * discarded — it is far more likely to be prose than a second intent.
 */
function extractProject(text: string, projects: readonly ProjectRef[]): ExtractedProject {
  const found = INLINE_PROJECT_PATTERN.exec(text);
  if (found === null) return { text, projectId: null, unresolved: null };

  const [matched, leading = "", ref = ""] = found;
  const match = matchProjectRef(ref, projects);

  if (match.outcome !== "matched") {
    // An unresolved reference stays exactly where it was typed. The user can see
    // it, search for it, and fix it in the editor.
    return { text, projectId: null, unresolved: { ref, reason: match.outcome } };
  }

  const removed = text.slice(0, found.index) + leading + text.slice(found.index + matched.length);

  return { text: removed, projectId: match.project.id, unresolved: null };
}

/**
 * A date is only read from the end of what remains. "monday meeting notes" is a
 * note about a meeting; treating its first word as a due date would quietly
 * rewrite the title into something the user never typed.
 */
function extractTrailingDate(
  text: string,
  today: IsoDate,
): { text: string; dueOn: IsoDate | null } {
  const match = matchTrailingDatePhrase(collapse(text), today);
  if (match === null) return { text, dueOn: null };

  // Stripping the phrase must leave something to call the item. "tomorrow" on
  // its own is a title, not an empty item due tomorrow.
  if (collapse(match.rest).length === 0) return { text, dueOn: null };

  return { text: match.rest, dueOn: match.dueOn };
}

/**
 * A repeat is read from the end, for the same reason a date is. "read Every Day
 * by David Levithan" keeps every word it was given.
 */
function extractTrailingRecurrence(
  text: string,
  today: IsoDate,
): { text: string; rule: RecurrenceRule | null; anchorOn: IsoDate | null } {
  const match = matchTrailingRecurrencePhrase(collapse(text), today);
  if (match === null) return { text, rule: null, anchorOn: null };

  // Stripping must leave something to call the item. A capture of just "daily"
  // is an item named "daily", not an unnamed daily habit.
  if (collapse(match.rest).length === 0) return { text, rule: null, anchorOn: null };

  return { text: match.rest, rule: match.rule, anchorOn: match.anchorOn };
}

function collapse(text: string): string {
  return text.replace(/\s{2,}/g, " ").trim();
}
