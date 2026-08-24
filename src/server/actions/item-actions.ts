"use server";

import { revalidatePath } from "next/cache";
import {
  captureItemSchema,
  createItemSchema,
  itemIdSchema,
  setItemDueDateSchema,
  setItemKindSchema,
  setItemProjectSchema,
  setItemStatusSchema,
  updateItemSchema,
} from "@/domain/items/item-schema";
import { type ActionResult, runAction } from "@/server/action-result";
import { getDb } from "@/server/db/client";
import * as service from "@/server/items/item-service";

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
    return { id };
  });
}

export async function createItemAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("createItem", async () => {
    const input = createItemSchema.parse(readItemForm(formData));
    const id = await service.createItem(getDb(), input);
    revalidateEverything();
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

export async function toggleItemCompletionAction(id: string): Promise<ActionResult<void>> {
  return runAction("toggleItemCompletion", async () => {
    const input = itemIdSchema.parse({ id });
    await service.toggleItemCompletionById(getDb(), input.id);
    revalidateEverything();
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

export async function setItemProjectAction(
  id: string,
  projectId: string | null,
): Promise<ActionResult<void>> {
  return runAction("setItemProject", async () => {
    const input = setItemProjectSchema.parse({ id, projectId });
    await service.setItemProject(getDb(), input.id, input.projectId);
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
