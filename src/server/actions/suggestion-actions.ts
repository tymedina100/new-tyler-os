"use server";

import { revalidatePath } from "next/cache";
import {
  dismissItemSuggestionsSchema,
  suggestionIdSchema,
} from "@/domain/suggestions/suggestion-schema";
import type { SuggestionOutcome } from "@/domain/suggestions/suggestion-rules";
import { type ActionResult, runAction } from "@/server/action-result";
import { getDb } from "@/server/db/client";
import * as service from "@/server/suggestions/suggestion-service";

/**
 * Server actions for suggestions.
 *
 * Ordinary actions, held to every rule the others are: input is re-validated
 * with a domain schema, an `ActionResult` comes back rather than a throw, and
 * no `redirect()` happens in here. Being the AI feature earns this file no
 * exemptions — it is the accept/dismiss half of a proposal, and the proposal
 * half never touches a client at all.
 *
 * Note what a client can send: an id. Not a kind, not a project, not a tag
 * name. The value being accepted was grounded on the server when the proposal
 * was stored, so there is no request shape in which the browser gets to say
 * what a suggestion meant.
 */

/**
 * Accepting one proposal.
 *
 * The outcome comes back so the caller can be honest about what happened. A
 * `superseded` acceptance changed nothing, and telling the user their newer
 * choice was kept is better than a success toast that quietly did nothing.
 */
export async function acceptSuggestionAction(
  id: string,
): Promise<ActionResult<{ outcome: SuggestionOutcome }>> {
  return runAction("acceptSuggestion", async () => {
    const input = suggestionIdSchema.parse({ id });
    const result = await service.acceptSuggestion(getDb(), input.id);
    revalidateEverything();
    return { outcome: result.outcome };
  });
}

export async function dismissSuggestionAction(id: string): Promise<ActionResult<void>> {
  return runAction("dismissSuggestion", async () => {
    const input = suggestionIdSchema.parse({ id });
    await service.dismissSuggestion(getDb(), input.id);
    revalidateEverything();
  });
}

/** Waving away everything suggested about one item, in one click. */
export async function dismissItemSuggestionsAction(itemId: string): Promise<ActionResult<void>> {
  return runAction("dismissItemSuggestions", async () => {
    const input = dismissItemSuggestionsSchema.parse({ itemId });
    await service.dismissItemSuggestions(getDb(), input.itemId);
    revalidateEverything();
  });
}

/** The same coarse revalidation every other mutation uses. See item-actions.ts. */
function revalidateEverything(): void {
  revalidatePath("/", "layout");
}
