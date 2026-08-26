import { z } from "zod";
import { MAX_TAGS_PER_ITEM } from "@/domain/items/item-schema";
import { SUGGESTION_FIELDS } from "./suggestion";

/**
 * Validation for the one input TylerOS does not control the shape of.
 *
 * Everywhere else, a Zod schema guards a form the repository itself ships. Here
 * it guards a language model, which is a different job: the schema is not
 * checking for a typo, it is the boundary that decides whether a response is
 * allowed to mean anything at all.
 *
 * Two rules follow from that, and both differ from the rest of the codebase:
 *
 *   - **It is permissive about shape and strict about values.** A missing field
 *     is `null`, not a failure, because a model that answers two of three
 *     questions has still been useful. What it may not do is answer with
 *     something that is not a string.
 *   - **A failure is silence, not an error.** `parseSuggestion` returns `null`
 *     rather than throwing. An optional suggestion that could not be read is a
 *     suggestion that does not appear, and there is nothing to tell the user.
 *
 * Note what is *not* here: no project ids, no tag ids, no item ids, no status,
 * no due date, no recurrence. The model returns names and a kind, and nothing
 * it says is a database identifier. Grounding those names against things that
 * actually exist is `groundSuggestion`'s job, and it is the reason a model can
 * never address a row directly.
 */

/** Room for the model to be wrong in before we stop reading. */
const MAX_SUGGESTED_TAGS = MAX_TAGS_PER_ITEM;
const MAX_VALUE_LENGTH = 120;

const optionalName = z
  .string()
  .max(MAX_VALUE_LENGTH)
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length === 0 ? null : trimmed;
  });

/**
 * The whole vocabulary a response is permitted.
 *
 * `.catch` on the tag list rather than a hard failure: a malformed tag array
 * should cost the tags, not the kind and the project alongside them.
 */
export const modelSuggestionSchema = z.object({
  kind: optionalName,
  project: optionalName,
  tags: z
    .array(z.string().max(MAX_VALUE_LENGTH))
    .max(MAX_SUGGESTED_TAGS)
    .nullish()
    .transform((value) => value ?? [])
    .catch([]),
});

export type ModelSuggestion = z.infer<typeof modelSuggestionSchema>;

/**
 * Reading a response body into a suggestion, or into nothing.
 *
 * Models are asked for bare JSON and usually give it, but a fenced code block
 * is the single most common deviation and it is cheap to survive. Anything
 * beyond that — prose, a truncated object, an array — is not repaired. Guessing
 * at a malformed response is how a proposer starts inventing.
 */
export function parseSuggestion(raw: string): ModelSuggestion | null {
  const body = stripCodeFence(raw).trim();
  if (body.length === 0) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    // Not swallowed: the caller reports this as a `malformed_json` outcome and
    // logs it. There is simply nothing here worth propagating as an exception.
    return null;
  }

  const parsed = modelSuggestionSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

function stripCodeFence(raw: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(raw);
  return fenced?.[1] ?? raw;
}

/** Accepting or dismissing one proposal. Ids only — the value is already stored. */
export const suggestionIdSchema = z.object({ id: z.uuid() });

export const dismissItemSuggestionsSchema = z.object({ itemId: z.uuid() });

export const suggestionFieldSchema = z.enum(SUGGESTION_FIELDS);
