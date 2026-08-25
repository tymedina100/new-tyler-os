"use server";

import { revalidatePath } from "next/cache";
import { inventoryNameSchema } from "@/domain/kitchen/inventory-schema";
import {
  addInventoryItemSchema,
  inventoryItemIdSchema,
  setInventoryLocationSchema,
  setInventoryQuantitySchema,
  updateInventoryItemSchema,
} from "@/domain/kitchen/inventory-schema";
import { type ActionResult, runAction } from "@/server/action-result";
import { getDb } from "@/server/db/client";
import * as service from "@/server/kitchen/inventory-service";

/**
 * Server actions for kitchen inventory.
 *
 * Same contract as everywhere else: validate with a domain schema, call a
 * service, return an ActionResult. Nothing throws at the client.
 */

function readInventoryForm(formData: FormData) {
  return {
    name: formData.get("name"),
    location: formData.get("location"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
    expiresOn: formData.get("expiresOn"),
    notes: formData.get("notes"),
  };
}

export async function addInventoryItemAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addInventoryItem", async () => {
    const input = addInventoryItemSchema.parse(readInventoryForm(formData));
    const id = await service.addInventoryItem(getDb(), input);
    revalidatePath("/", "layout");
    return { id };
  });
}

export async function updateInventoryItemAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("updateInventoryItem", async () => {
    const input = updateInventoryItemSchema.parse({
      ...readInventoryForm(formData),
      id: formData.get("id"),
    });

    const id = await service.updateInventoryItem(getDb(), input);
    revalidatePath("/", "layout");
    return { id };
  });
}

/** Nudging a number from the list, where opening the editor is too slow. */
export async function setInventoryQuantityAction(
  id: string,
  quantity: string | null,
): Promise<ActionResult<void>> {
  return runAction("setInventoryQuantity", async () => {
    const input = setInventoryQuantitySchema.parse({ id, quantity });
    await service.setInventoryQuantity(getDb(), input.id, input.quantity);
    revalidatePath("/", "layout");
  });
}

export async function setInventoryLocationAction(
  id: string,
  location: string,
): Promise<ActionResult<void>> {
  return runAction("setInventoryLocation", async () => {
    const input = setInventoryLocationSchema.parse({ id, location });
    await service.setInventoryLocation(getDb(), input.id, input.location);
    revalidatePath("/", "layout");
  });
}

/** A mistaken record. Deliberately does not touch the shopping list. */
export async function deleteInventoryItemAction(id: string): Promise<ActionResult<void>> {
  return runAction("deleteInventoryItem", async () => {
    const input = inventoryItemIdSchema.parse({ id });
    await service.deleteInventoryItem(getDb(), input.id);
    revalidatePath("/", "layout");
  });
}

/** Finished it: the record goes and the shopping list gains a line. */
export async function markUsedUpAction(id: string): Promise<ActionResult<{ name: string }>> {
  return runAction("markInventoryUsedUp", async () => {
    const input = inventoryItemIdSchema.parse({ id });
    const result = await service.markInventoryUsedUp(getDb(), input.id);
    revalidatePath("/", "layout");
    return result;
  });
}

export async function addToShoppingListAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addToShoppingList", async () => {
    const name = inventoryNameSchema.parse(formData.get("name"));
    const id = await service.addToShoppingList(getDb(), name);
    revalidatePath("/", "layout");
    return { id };
  });
}
