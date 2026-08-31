/**
 * Routing the one capture box to Notes instead of Items.
 *
 * Everything else in `src/domain/capture/` interprets text that is *already*
 * headed for the item spine — `#tag`, `@project`, a trailing date or repeat
 * (ADR 017). This is the one decision made *before* any of that: is the whole
 * capture a note, not an item, at all?
 *
 * The rule is a single reserved prefix, exactly as `#` and `@` are already
 * reserved. `note:` must be the literal, case-insensitive start of the text —
 * not merely a prefix of the first word, so "notebook: check reviews" is left
 * completely alone and reaches `parseCapture` as an ordinary item. And it must
 * leave something behind: a bare "note:" with nothing after it falls through
 * to an ordinary item capture titled "note:", the same "stripping must leave
 * something" rule ADR 018 and ADR 025 already apply to a date or a repeat
 * phrase that would otherwise swallow the whole capture.
 *
 * Deliberately not a second thing `parseCapture` itself understands: routing
 * to a different domain is not "interpreting a capture," and folding it in
 * would mean the item parser has to know Notes exist. See ADR 033.
 */

const NOTE_PREFIX_PATTERN = /^note:\s*/i;

/**
 * Returns the note body if `raw` is a note capture, `null` otherwise —
 * including when `note:` was typed with nothing after it, which is treated as
 * "not a note capture" rather than "an empty note."
 */
export function matchNotePrefix(raw: string): string | null {
  const trimmed = raw.trim();
  if (!NOTE_PREFIX_PATTERN.test(trimmed)) return null;

  const body = trimmed.replace(NOTE_PREFIX_PATTERN, "").trim();
  return body.length > 0 ? body : null;
}
