import { z } from "zod";
import { dueOnSchema, titleSchema } from "@/domain/items/item-schema";
import { ITEM_STATUSES } from "@/domain/items/item";

export const mobileSessionSchema = z.object({ passphrase: z.string().min(1).max(1024) }).strict();
export const mobileCaptureSchema = z
  .object({
    requestId: z.uuid(),
    text: z.string().trim().min(1).max(10_006),
  })
  .strict();
export const mobileRequestSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.literal("today_briefing"),
  })
  .strict();
export const mobileApprovalSchema = z
  .object({
    requestId: z.uuid(),
    decision: z.enum(["accept", "dismiss"]),
  })
  .strict();
export const mobileEditSchema = z
  .object({
    requestId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    title: titleSchema.optional(),
    body: z.string().max(10_000).nullable().optional(),
    status: z.enum(ITEM_STATUSES).optional(),
    dueOn: dueOnSchema.optional(),
  })
  .strict()
  .refine((value) => ["title", "body", "status", "dueOn"].some((key) => key in value), {
    message: "Choose a field to edit.",
  });
export type MobileEdit = z.infer<typeof mobileEditSchema>;
