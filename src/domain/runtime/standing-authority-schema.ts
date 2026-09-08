import { z } from "zod";
import { APPROVAL_KINDS, JOB_KINDS, ROLES } from "./runtime";
import { STANDING_AUTHORITY_KEY_PATTERN } from "./standing-authority";

/**
 * Granting authority is an explicit admin action. Role, job kind, and action
 * are all required. There is no default Miles grant and no role-only form.
 */
export const grantStandingAuthoritySchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(
        STANDING_AUTHORITY_KEY_PATTERN,
        "Authority keys are lowercase kebab-case, like miles-ai-briefing-note.",
      ),
    role: z.enum(ROLES),
    jobKind: z.enum(JOB_KINDS),
    action: z.enum(APPROVAL_KINDS),
  })
  .strict();
export type GrantStandingAuthorityInput = z.infer<typeof grantStandingAuthoritySchema>;

export const standingAuthorityKeySchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(STANDING_AUTHORITY_KEY_PATTERN, "Authority keys are lowercase kebab-case."),
  })
  .strict();
export type StandingAuthorityKeyInput = z.infer<typeof standingAuthorityKeySchema>;
