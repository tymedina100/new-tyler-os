import type { TagRef } from "@/domain/tags/tag";

/**
 * A Note is durable, retrievable knowledge — not a responsibility.
 *
 * TASKS answers "what should I do," UPCOMING "what is happening," KITCHEN
 * "what do I have," SEARCH "where did I put it." Nothing answered "what do I
 * know" until this domain: car maintenance facts, apartment measurements,
 * interview notes, reference material, half-formed plans.
 *
 * This is deliberately **not** an Item. An item's `body` (see
 * `src/domain/items/item.ts`) is supporting context for something actionable
 * and dies with that item's own lifecycle. A Note's primary identity is the
 * information itself: no `status`, no `dueOn`, nothing that can be Done,
 * Someday or Archived. See docs/DECISIONS.md ADR 033.
 */

export const MAX_NOTE_TITLE_LENGTH = 200;
/** Long-form, unlike an item's body (10 000) — a note is meant to hold real content. */
export const MAX_NOTE_BODY_LENGTH = 50_000;
export const MAX_TAGS_PER_NOTE = 8;

/** Used only when a note has neither a title nor any body text to derive one from. */
export const UNTITLED_NOTE_TITLE = "Untitled note";

export interface Note {
  id: string;
  title: string;
  /** Markdown source. Never rendered as raw HTML — see ADR 034. */
  body: string;
  pinned: boolean;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteWithRelations extends Note {
  project: { id: string; name: string } | null;
  tags: TagRef[];
}
