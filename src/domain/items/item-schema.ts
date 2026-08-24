import { z } from "zod";
import { isIsoDate } from "@/domain/shared/date";
import { normalizeTagNames } from "@/domain/tags/tag";
import { ITEM_KINDS, ITEM_STATUSES } from "./item";

/**
 * Runtime validation for everything that enters the system.
 *
 * These schemas live in the domain because they describe the shape of domain
 * concepts, not the shape of an HTTP request. The same schema validates a form
 * submission, a server action argument and a future API payload.
 *
 * Inputs arrive from HTML forms, so they are strings — including the empty
 * string, which must become `null` rather than an empty value in the database.
 */

export const MAX_TITLE_LENGTH = 280;
export const MAX_BODY_LENGTH = 10_000;
export const MAX_TAGS_PER_ITEM = 8;

const emptyToNull = (max: number) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return (value ?? null) as unknown;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }, z.string().max(max).nullable());

export const titleSchema = z
  .string()
  .trim()
  .min(1, "Give it a title.")
  .max(MAX_TITLE_LENGTH, `Keep titles under ${MAX_TITLE_LENGTH} characters.`);

export const dueOnSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return (value ?? null) as unknown;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().refine(isIsoDate, "Use a valid date.").nullable(),
);

export const projectIdSchema = z.preprocess((value) => {
  if (typeof value !== "string") return (value ?? null) as unknown;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === "none" ? null : trimmed;
}, z.uuid("Unknown project.").nullable());

export const tagListSchema = z
  .preprocess(
    (value) => {
      if (value === null || value === undefined) return [];
      if (typeof value === "string") return value.split(/[,\s]+/);
      return value;
    },
    z.array(z.string()),
  )
  .transform(normalizeTagNames)
  .refine(
    (names) => names.length <= MAX_TAGS_PER_ITEM,
    `Use at most ${MAX_TAGS_PER_ITEM} tags.`,
  );

/**
 * The fast path: one box, one line of text.
 *
 * `projectId` is set only when capturing from inside a project, where the item
 * already has a home and does not need to pass through the inbox.
 */
export const captureItemSchema = z.object({
  text: z.string().trim().min(1, "Nothing to capture.").max(MAX_TITLE_LENGTH),
  projectId: projectIdSchema,
});
export type CaptureItemInput = z.infer<typeof captureItemSchema>;

export const createItemSchema = z.object({
  title: titleSchema,
  body: emptyToNull(MAX_BODY_LENGTH),
  kind: z.enum(ITEM_KINDS),
  status: z.enum(ITEM_STATUSES),
  dueOn: dueOnSchema,
  projectId: projectIdSchema,
  tags: tagListSchema,
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.extend({ id: z.uuid() });
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const itemIdSchema = z.object({ id: z.uuid() });

export const setItemKindSchema = z.object({
  id: z.uuid(),
  kind: z.enum(ITEM_KINDS),
});

export const setItemStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(ITEM_STATUSES),
});

export const setItemDueDateSchema = z.object({
  id: z.uuid(),
  dueOn: dueOnSchema,
});

export const setItemProjectSchema = z.object({
  id: z.uuid(),
  projectId: projectIdSchema,
});

/** Filters used by the inbox, task and search views. Sourced from URL params. */
export const itemQuerySchema = z.object({
  q: z.preprocess((value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().max(MAX_TITLE_LENGTH).optional()),
  kind: z.enum(ITEM_KINDS).optional().catch(undefined),
  status: z.enum(ITEM_STATUSES).optional().catch(undefined),
  projectId: z.uuid().optional().catch(undefined),
  tag: z.string().optional().catch(undefined),
});
export type ItemQuery = z.infer<typeof itemQuerySchema>;
