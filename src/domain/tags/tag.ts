/**
 * Tags are the cross-cutting axis of organisation.
 *
 * Projects group work that belongs together; kinds say what something is; tags
 * are for everything else ("#home", "#errand", "#reading"). They are the reason
 * captured information can be retrieved across module boundaries later on.
 */

export interface Tag {
  id: string;
  name: string;
  createdAt: Date;
}

export interface TagRef {
  id: string;
  name: string;
}

export const MAX_TAG_LENGTH = 32;

/**
 * Tag names are normalised aggressively so that "#Home", "#home" and "# home"
 * are the same tag. Normalisation is the only reason tags stay useful in a
 * system captured into at speed.
 */
export function normalizeTagName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_TAG_LENGTH)
    .replace(/^-+|-+$/g, "");
}

export function normalizeTagNames(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const value of raw) {
    const name = normalizeTagName(value);
    if (name.length > 0) seen.add(name);
  }
  return [...seen];
}
