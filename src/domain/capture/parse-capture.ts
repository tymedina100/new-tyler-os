import { normalizeTagNames } from "@/domain/tags/tag";

/**
 * Capture parsing.
 *
 * Capture must cost nothing. Typing "buy paper towels #home" should file the
 * item under #home without a second interaction, because organisation that
 * costs keystrokes does not survive contact with real life.
 *
 * This is plain string handling on purpose. Natural-language date parsing
 * ("pay electric bill Friday") is a deliberate later step, and AI classification
 * later still — neither belongs in the hot path of capture today.
 */

export interface ParsedCapture {
  title: string;
  tags: string[];
}

/** Matches `#tag` when it starts a word, so URLs and `C#` are left alone. */
const INLINE_TAG_PATTERN = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

export function parseCaptureText(raw: string): ParsedCapture {
  const text = raw.trim();
  const found: string[] = [];

  const stripped = text.replace(INLINE_TAG_PATTERN, (_match, leading: string, tag: string) => {
    found.push(tag);
    return leading;
  });

  const title = stripped.replace(/\s{2,}/g, " ").trim();

  return {
    // Capturing only tags is unusual but should never lose the text typed.
    title: title.length > 0 ? title : text,
    tags: normalizeTagNames(found),
  };
}
