import { z } from "zod";
import { MAX_RECURRENCE_INTERVAL, RECURRENCE_FREQUENCIES } from "@/domain/recurrence/recurrence";

/**
 * Validation for a repeat.
 *
 * Recurrence arrives from an HTML form as two strings, and "does not repeat"
 * arrives as the string "none" — the same convention `projectIdSchema` already
 * uses for "no project", so a `<select>` never has to send an empty value.
 * Turning those two strings into a rule or a null is domain policy, so it lives
 * here rather than being decided in a server action.
 */

/** The `<option>` value meaning "this does not repeat". */
export const NO_RECURRENCE = "none";

export const recurrenceIntervalSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return 1;
    if (typeof value === "number") return value;
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    if (trimmed.length === 0) return 1;

    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? trimmed : parsed;
  },
  z
    .number("Use a whole number of periods.")
    .int("Use a whole number of periods.")
    .min(1, "It has to repeat at least every period.")
    .max(MAX_RECURRENCE_INTERVAL, `Repeat at most every ${MAX_RECURRENCE_INTERVAL} periods.`),
);

export const recurrenceRuleSchema = z.object({
  frequency: z.enum(RECURRENCE_FREQUENCIES, { message: "Pick how often it repeats." }),
  interval: recurrenceIntervalSchema,
});
export type RecurrenceRuleInput = z.infer<typeof recurrenceRuleSchema>;

/**
 * A repeat, or none at all.
 *
 * Anything that is not a real frequency collapses to `null` rather than
 * failing: an item that does not repeat is the overwhelmingly common case and
 * must never be an error.
 */
export const optionalRecurrenceSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return value;

  const raw = value as { frequency?: unknown; interval?: unknown };
  if (typeof raw.frequency !== "string") return null;

  const frequency = raw.frequency.trim();
  if (frequency.length === 0 || frequency === NO_RECURRENCE) return null;

  return { frequency, interval: raw.interval };
}, recurrenceRuleSchema.nullable());

export const setItemRecurrenceSchema = z.object({
  id: z.uuid(),
  recurrence: optionalRecurrenceSchema,
});
