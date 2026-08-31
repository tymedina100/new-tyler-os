import { MAX_NOTE_TITLE_LENGTH, type Note, UNTITLED_NOTE_TITLE } from "@/domain/notes/note";

/**
 * Pure rules over notes.
 *
 * Small on purpose: a note is mostly a truthful record of what was typed. The
 * one genuinely interesting behaviour is title derivation, because a note
 * should never *require* a title the way an item requires one (ADR 033) — the
 * fastest way to capture knowledge is to just start writing.
 */

/**
 * The title to store, given what the editor's two fields hold.
 *
 * An explicit title always wins, even over a body that starts differently —
 * the user said so on purpose. Otherwise the first non-blank line of the body
 * becomes the title, the way a filename is inferred from a document's first
 * line elsewhere. With neither, the note still needs a real title to appear
 * in a list of notes, hence the fallback.
 */
export function deriveNoteTitle(title: string | null, body: string): string {
  const trimmedTitle = title?.trim();
  if (trimmedTitle) return truncate(trimmedTitle, MAX_NOTE_TITLE_LENGTH);

  const firstLine = firstNonEmptyLine(body);
  if (firstLine) return truncate(firstLine, MAX_NOTE_TITLE_LENGTH);

  return UNTITLED_NOTE_TITLE;
}

function firstNonEmptyLine(body: string): string | null {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/** How far into a note's body a list row or a search result quotes. */
export const NOTE_EXCERPT_LENGTH = 140;

/**
 * A one-line taste of what a note actually says.
 *
 * Whitespace (including the newlines that give a note its structure) is
 * collapsed to single spaces: an excerpt is read as a fragment of a sentence,
 * not as a miniature rendering of the markdown. `null` for an empty body
 * rather than an empty string, so a caller can tell "nothing to show" from
 * "shows nothing" without inspecting length itself.
 */
export function buildNoteExcerpt(body: string, maxLength = NOTE_EXCERPT_LENGTH): string | null {
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return null;

  return truncate(collapsed, maxLength);
}

/**
 * Sorting for a list of notes: pinned first, then most recently touched.
 *
 * "These are notes I repeatedly need" (pinned) always outranks "these are
 * notes I most recently wrote or edited" (recency) — the whole point of
 * pinning is to survive being pushed down by newer, unrelated notes. Equal
 * timestamps break the tie on id, which is never meaningful but is what
 * keeps the order total and therefore assertable, the same discipline
 * `src/domain/search/search-ranking.ts` uses.
 */
export function compareNotesForDisplay(a: Note, b: Note): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

  const byUpdatedAt = b.updatedAt.getTime() - a.updatedAt.getTime();
  if (byUpdatedAt !== 0) return byUpdatedAt;

  return a.id.localeCompare(b.id);
}
