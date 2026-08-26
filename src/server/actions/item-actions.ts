"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  captureItemSchema,
  itemIdSchema,
  setItemDueDateSchema,
  setItemKindSchema,
  setItemStatusSchema,
  updateItemSchema,
} from "@/domain/items/item-schema";
import { describeRecurrence } from "@/domain/recurrence/recurrence";
import { setItemRecurrenceSchema } from "@/domain/recurrence/recurrence-schema";
import { type ActionResult, runAction } from "@/server/action-result";
import { getDb } from "@/server/db/client";
import * as service from "@/server/items/item-service";
import { runSuggestionPass } from "@/server/suggestions/suggestion-run";

/**
 * Server actions for items.
 *
 * Every action re-validates its input: a client is never trusted, even one this
 * codebase ships. Actions return an ActionResult rather than throwing, so the
 * UI can always tell success from failure.
 *
 * Deliberately no `redirect()` in here. Redirects work by throwing, and the
 * error handling in runAction would swallow them. Navigation belongs to the
 * component that knows where the user should end up.
 */

export async function captureItemAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("captureItem", async () => {
    const input = captureItemSchema.parse({
      text: formData.get("text"),
      projectId: formData.get("projectId"),
    });

    const id = await service.captureItem(getDb(), input);
    revalidateEverything();

    // Scheduled, not awaited. `after` runs its callback once the response has
    // already been sent, so Enter is never waiting on a model — capture stays
    // exactly as fast with AI configured as without it, which is the whole
    // reason the suggestion is a later event rather than part of the capture.
    //
    // It is deliberately the last thing here: the item is written and committed
    // before anything AI-shaped exists, so there is no arrangement of failures
    // in which a capture is lost to a suggestion. `runSuggestionPass` returns
    // immediately when AI is not configured, and never throws either way.
    after(() => runSuggestionPass(getDb(), id));

    return { id };
  });
}

export async function updateItemAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("updateItem", async () => {
    const input = updateItemSchema.parse({ ...readItemForm(formData), id: formData.get("id") });
    const id = await service.updateItem(getDb(), input);
    revalidateEverything();
    return { id };
  });
}

/**
 * Completing an item — or, when it repeats, completing this occurrence of it.
 *
 * The next due date comes back so the caller can say so out loud. A recurring
 * item ticked off and reappearing on a different date is alarming unless
 * something tells you that is what just happened.
 */
export async function toggleItemCompletionAction(
  id: string,
): Promise<ActionResult<service.CompletionOutcome>> {
  return runAction("toggleItemCompletion", async () => {
    const input = itemIdSchema.parse({ id });
    const outcome = await service.toggleItemCompletionById(getDb(), input.id);
    revalidateEverything();
    return outcome;
  });
}

export async function skipItemOccurrenceAction(
  id: string,
): Promise<ActionResult<service.CompletionOutcome>> {
  return runAction("skipItemOccurrence", async () => {
    const input = itemIdSchema.parse({ id });
    const outcome = await service.skipItemOccurrence(getDb(), input.id);
    revalidateEverything();
    return outcome;
  });
}

/** Making an item repeat, changing how it repeats, or stopping it. */
export async function setItemRecurrenceAction(
  id: string,
  frequency: string | null,
  interval: number | null,
): Promise<ActionResult<{ dueOn: string | null; description: string | null }>> {
  return runAction("setItemRecurrence", async () => {
    const input = setItemRecurrenceSchema.parse({ id, recurrence: { frequency, interval } });
    const result = await service.setItemRecurrence(getDb(), input.id, input.recurrence);
    revalidateEverything();

    return {
      dueOn: result.dueOn,
      description: result.recurrence ? describeRecurrence(result.recurrence) : null,
    };
  });
}

export async function setItemKindAction(id: string, kind: string): Promise<ActionResult<void>> {
  return runAction("setItemKind", async () => {
    const input = setItemKindSchema.parse({ id, kind });
    await service.setItemKind(getDb(), input.id, input.kind);
    revalidateEverything();
  });
}

export async function setItemStatusAction(id: string, status: string): Promise<ActionResult<void>> {
  return runAction("setItemStatus", async () => {
    const input = setItemStatusSchema.parse({ id, status });
    await service.setItemStatus(getDb(), input.id, input.status);
    revalidateEverything();
  });
}

export async function setItemDueDateAction(
  id: string,
  dueOn: string | null,
): Promise<ActionResult<void>> {
  return runAction("setItemDueDate", async () => {
    const input = setItemDueDateSchema.parse({ id, dueOn });
    await service.setItemDueDate(getDb(), input.id, input.dueOn);
    revalidateEverything();
  });
}

export async function restoreItemAction(id: string): Promise<ActionResult<void>> {
  return runAction("restoreItem", async () => {
    const input = itemIdSchema.parse({ id });
    await service.restoreItemById(getDb(), input.id);
    revalidateEverything();
  });
}

export async function deleteItemAction(id: string): Promise<ActionResult<void>> {
  return runAction("deleteItem", async () => {
    const input = itemIdSchema.parse({ id });
    await service.deleteItem(getDb(), input.id);
    revalidateEverything();
  });
}

function readItemForm(formData: FormData) {
  return {
    title: formData.get("title"),
    body: formData.get("body"),
    kind: formData.get("kind"),
    status: formData.get("status"),
    dueOn: formData.get("dueOn"),
    projectId: formData.get("projectId"),
    tags: formData.get("tags"),
    // Two fields, one concept. The schema decides what "none" means, so the
    // action never has to know that a repeat can be absent.
    recurrence: {
      frequency: formData.get("recurrenceFrequency"),
      interval: formData.get("recurrenceInterval"),
    },
  };
}

/**
 * Item counts appear in the sidebar on every page, so a mutation anywhere
 * invalidates everywhere. At personal scale this costs nothing and removes a
 * whole category of stale-badge bugs.
 */
function revalidateEverything(): void {
  revalidatePath("/", "layout");
}
