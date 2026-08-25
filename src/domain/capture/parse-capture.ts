import { matchTrailingDatePhrase } from "@/domain/capture/date-phrase";
import { matchProjectRef } from "@/domain/capture/project-ref";
import type { ProjectRef } from "@/domain/projects/project";
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
 * The order is fixed: **tags, then `@project`, then a trailing date.** Removing
 * the labelled tokens first is what makes "pay bill friday #finance" and
 * "pay bill #finance friday" the same capture, which is the only behaviour a
 * person typing quickly can predict.
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
}

/** Matches `#tag` when it starts a word, so URLs and `C#` are left alone. */
const INLINE_TAG_PATTERN = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

/** Matches `@project` when it starts a word, so `tyler@example.com` is not one. */
const INLINE_PROJECT_PATTERN = /(^|\s)@([\p{L}\p{N}][\p{L}\p{N}._-]*)/u;

export function parseCapture(raw: string, context: CaptureContext): ParsedCapture {
  const text = raw.trim();

  const { withoutTags, tags } = extractTags(text);
  const project = extractProject(withoutTags, context.projects);
  const dated = extractTrailingDate(project.text, context.today);

  const title = collapse(dated.text);

  return {
    // Capturing only metadata is unusual, but must never lose what was typed.
    title: title.length > 0 ? title : text,
    tags,
    dueOn: dated.dueOn,
    projectId: project.projectId,
    unresolvedProject: project.unresolved,
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

function collapse(text: string): string {
  return text.replace(/\s{2,}/g, " ").trim();
}
