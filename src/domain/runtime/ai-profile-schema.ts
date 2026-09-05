import { z } from "zod";
import { AI_PROFILE_KEY_PATTERN, AI_PROVIDERS } from "./ai-profile";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length === 0 ? null : trimmed;
    });

/**
 * Creating a profile is an explicit admin action. Provider and model are
 * required. There is no API-key field: secrets stay in the runtime environment.
 */
export const createAiExecutionProfileSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(
        AI_PROFILE_KEY_PATTERN,
        "Profile keys are lowercase kebab-case, like miles-briefing-primary.",
      ),
    name: z.string().trim().min(1, "A profile needs a display name.").max(80),
    provider: z.enum(AI_PROVIDERS),
    model: z.string().trim().min(1, "A profile needs an explicit model identifier.").max(120),
    product: optionalText(80),
    poolKey: optionalText(80),
    enabled: z.boolean().optional().default(true),
  })
  .strict();
export type CreateAiExecutionProfileInput = z.infer<typeof createAiExecutionProfileSchema>;

export const enqueueTodayBriefingAiSchema = z
  .object({
    profileId: z.uuid(),
  })
  .strict();
export type EnqueueTodayBriefingAiInput = z.infer<typeof enqueueTodayBriefingAiSchema>;
