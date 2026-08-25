import type { InventoryItem, KitchenLocation } from "@/domain/kitchen/inventory";
import { shoppingTextFor } from "@/domain/kitchen/inventory-rules";
import { EXPIRING_SOON_DAYS } from "@/domain/kitchen/inventory-rules";
import type {
  AddInventoryItemInput,
  UpdateInventoryItemInput,
} from "@/domain/kitchen/inventory-schema";
import { addDays, type IsoDate, todayIsoDate } from "@/domain/shared/date";
import { NotFoundError } from "@/domain/shared/errors";
import type { Database } from "@/server/db/client";
import { captureItem, setItemKind } from "@/server/items/item-service";
import * as repo from "@/server/kitchen/inventory-repository";

/**
 * Kitchen use cases.
 *
 * Thin on purpose: inventory is mostly CRUD over truthful records, and the one
 * genuinely interesting behaviour — running out of something — is orchestration
 * across two domains rather than a rule of its own.
 */

export async function listInventory(
  db: Database,
  filters: repo.InventoryFilters = {},
): Promise<InventoryItem[]> {
  return repo.listInventory(db, filters);
}

export async function getInventoryItem(db: Database, id: string): Promise<InventoryItem | null> {
  return repo.findInventoryItemById(db, id);
}

export async function countInventoryByLocation(
  db: Database,
): Promise<Map<KitchenLocation, number>> {
  return repo.countInventoryByLocation(db);
}

export async function findInventory(
  db: Database,
  query: string,
  limit?: number,
): Promise<InventoryItem[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  return repo.searchInventory(db, trimmed, limit);
}

export interface ExpiringSoon {
  today: IsoDate;
  items: InventoryItem[];
}

/**
 * Food worth noticing before it is thrown away. The window is the domain's, so
 * Today and the Kitchen page cannot disagree about what "soon" means.
 */
export async function getExpiringSoon(db: Database, now = new Date()): Promise<ExpiringSoon> {
  const today = todayIsoDate(now);
  const items = await repo.listExpiringThrough(db, addDays(today, EXPIRING_SOON_DAYS));
  return { today, items };
}

export async function addInventoryItem(
  db: Database,
  input: AddInventoryItemInput,
): Promise<string> {
  return repo.insertInventoryItem(db, input);
}

export async function updateInventoryItem(
  db: Database,
  input: UpdateInventoryItemInput,
): Promise<string> {
  const { id, ...patch } = input;
  const updated = await repo.updateInventoryRow(db, id, patch);

  if (updated === null) throw new NotFoundError("Inventory item", id);
  return updated;
}

export async function setInventoryQuantity(
  db: Database,
  id: string,
  quantity: number | null,
): Promise<void> {
  const updated = await repo.updateInventoryRow(db, id, { quantity });
  if (updated === null) throw new NotFoundError("Inventory item", id);
}

export async function setInventoryLocation(
  db: Database,
  id: string,
  location: KitchenLocation,
): Promise<void> {
  const updated = await repo.updateInventoryRow(db, id, { location });
  if (updated === null) throw new NotFoundError("Inventory item", id);
}

/** A record entered by mistake. Nothing else happens. */
export async function deleteInventoryItem(db: Database, id: string): Promise<void> {
  const deleted = await repo.deleteInventoryRow(db, id);
  if (!deleted) throw new NotFoundError("Inventory item", id);
}

/**
 * "I used the rest of this."
 *
 * Finishing something and needing more of it are the same moment in a kitchen,
 * so this does both: the record goes, and a shopping line appears. It is a
 * separate action from deleting precisely because the two intents differ —
 * a mistaken record should not put anything on a shopping list.
 *
 * The shopping line is created through capture like every other item, so tags,
 * dates and `@project` in the name still work and ADR 013 still holds.
 */
export async function markInventoryUsedUp(db: Database, id: string): Promise<{ name: string }> {
  const item = await repo.findInventoryItemById(db, id);
  if (item === null) throw new NotFoundError("Inventory item", id);

  await addToShoppingList(db, shoppingTextFor(item.name, item.unit));
  await repo.deleteInventoryRow(db, id);

  return { name: item.name };
}

/**
 * Shopping lines are Items, not kitchen records.
 *
 * "Buy more olive oil" is something to act on; the jar in the pantry is not.
 * Keeping the list on the item spine means capture, search, tags and completion
 * all work on it without a second implementation of any of them. See ADR 021.
 */
export async function addToShoppingList(db: Database, text: string): Promise<string> {
  const id = await captureItem(db, { text, projectId: null });
  await setItemKind(db, id, "purchase");
  return id;
}
