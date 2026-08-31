import { z } from "zod";
import {
  MAX_NOTE_BODY_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  MAX_TAGS_PER_NOTE,
} from "@/domain/notes/note";
import { normalizeTagNames } from "@/domain/tags/tag";

/**
 * Runtime validation for everything entering the Notes domain.
 *
 * Inputs arrive from HTML forms, so every field is a string — including the
 * empty string, which has to become `null` or `""` rather than pass through
 * literally. The preprocessors below are written locally rather than
 * imported from `item-schema.ts`: the shapes rhyme, but each domain owns its
 * own — the same choice `kitchen/inventory-schema.ts` already made.
 */

const emptyToNull = (max: number) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return (value ?? null) as unknown;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }, z.string().max(max).nullable());

export const noteTitleSchema = emptyToNull(MAX_NOTE_TITLE_LENGTH);

/** Never null: an absent body is simply an empty note, not an unset field. */
export const noteBodySchema = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z.string().max(MAX_NOTE_BODY_LENGTH),
);

export const noteProjectIdSchema = z.preprocess((value) => {
  if (typeof value !== "string") return (value ?? null) as unknown;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === "none" ? null : trimmed;
}, z.uuid("Unknown project.").nullable());

export const noteTagListSchema = z
  .preprocess((value) => {
    if (value === null || value === undefined) return [];
    if (typeof value === "string") return value.split(/[,\s]+/);
    return value;
  }, z.array(z.string()))
  .transform(normalizeTagNames)
  .refine((names) => names.length <= MAX_TAGS_PER_NOTE, `Use at most ${MAX_TAGS_PER_NOTE} tags.`);

/**
 * The fast path — quick capture and the `note:` prefix in the global capture
 * box both go through this. A note needs *something* to exist for; an empty
 * capture is refused the same way an empty item capture already is.
 *
 * `projectId` exists only for the Notes quick-capture box on a project's own
 * page (mirroring how `CaptureBar` already takes one) — the global `note:`
 * prefix never sends one, and an absent field resolves to `null` exactly as
 * an absent `projectId` already does on an ordinary item capture.
 */
export const captureNoteSchema = z.object({
  body: z.string().trim().min(1, "Nothing to capture.").max(MAX_NOTE_BODY_LENGTH),
  projectId: noteProjectIdSchema,
});
export type CaptureNoteInput = z.infer<typeof captureNoteSchema>;

export const noteFieldsSchema = z.object({
  title: noteTitleSchema,
  body: noteBodySchema,
  tags: noteTagListSchema,
  projectId: noteProjectIdSchema,
});

/**
 * A note with neither a title nor any body text is not a note — it is a
 * blank row. Refused rather than silently stored as "Untitled note" with
 * nothing in it, which would just be clutter with an extra step to remove.
 */
export const updateNoteSchema = noteFieldsSchema
  .extend({ id: z.uuid() })
  .refine((input) => (input.title?.trim().length ?? 0) > 0 || input.body.trim().length > 0, {
    path: ["body"],
    message: "A note needs a title or some content.",
  });
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const noteIdSchema = z.object({ id: z.uuid() });

export const setNotePinnedSchema = z.object({
  id: z.uuid(),
  pinned: z.preprocess((value) => value === "true" || value === true, z.boolean()),
});
