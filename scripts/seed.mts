import "dotenv/config";
import {
  addInventoryItemSchema,
  type AddInventoryItemInput,
} from "@/domain/kitchen/inventory-schema";
import { addDays, todayIsoDate } from "@/domain/shared/date";
import { getDb } from "@/server/db/client";
import * as items from "@/server/items/item-service";
import { addInventoryItem, addToShoppingList } from "@/server/kitchen/inventory-service";
import { createProject } from "@/server/projects/project-service";

/**
 * Fills an empty TylerOS with enough realistic material to judge the UI.
 *
 * It goes through the services rather than writing rows directly, so seeding
 * exercises the same rules the app does - and breaks loudly if they change.
 * Safe to run only on a database you are happy to add rows to.
 */

const db = getDb();
const today = todayIsoDate(new Date());

const kitchen = await createProject(db, {
  name: "Kitchen Refresh",
  description: "Replace the worktop and sort the storage out before winter.",
  status: "active",
});

const tylerOs = await createProject(db, {
  name: "TylerOS",
  description: "Build the personal operating system.",
  status: "active",
});

// Untriaged: exactly as it would arrive from the capture bar.
await items.captureItem(db, { text: "look into a monitor arm #office", projectId: null });
await items.captureItem(db, {
  text: "AI assistant idea: persistent context evaluator",
  projectId: null,
});
await items.captureItem(db, { text: "research standing desks", projectId: null });

const bill = await items.captureItem(db, { text: "pay electric bill #home", projectId: null });
await items.setItemKind(db, bill, "task");
await items.setItemDueDate(db, bill, addDays(today, -2));

const towels = await items.captureItem(db, { text: "buy paper towels #errand", projectId: null });
await items.setItemKind(db, towels, "task");
await items.setItemDueDate(db, towels, today);

const pantry = await items.captureItem(db, {
  text: "finish pantry inventory #home",
  projectId: kitchen,
});
await items.setItemKind(db, pantry, "task");
await items.setItemDueDate(db, pantry, addDays(today, 3));

const severance = await items.captureItem(db, { text: "watch Severance #tv", projectId: null });
await items.setItemKind(db, severance, "media");
await items.setItemStatus(db, severance, "someday");

const tiles = await items.captureItem(db, { text: "order worktop samples", projectId: kitchen });
await items.setItemKind(db, tiles, "task");

const plumber = await items.captureItem(db, { text: "book the plumber", projectId: kitchen });
await items.setItemKind(db, plumber, "task");
await items.toggleItemCompletionById(db, plumber);

const roadmap = await items.captureItem(db, { text: "write the 0.2 roadmap", projectId: tylerOs });
await items.updateItem(db, {
  id: roadmap,
  title: "write the 0.2 roadmap",
  body: "Decide what earns a place after the Life Inbox. Keep it to one milestone.",
  kind: "note",
  status: "active",
  dueOn: addDays(today, 5),
  projectId: tylerOs,
  tags: ["planning"],
});

/**
 * Kitchen inventory. Fictional food, chosen to cover every shape the model
 * allows: all three locations, measured and counted and container quantities,
 * an uncounted one, an expired one, one going off within the window, and two
 * packages of the same thing that must stay two records.
 */
const inventory: AddInventoryItemInput[] = [
  {
    name: "Chicken breast",
    location: "freezer",
    quantity: 2,
    unit: "lb",
    expiresOn: addDays(today, 60),
    notes: null,
  },
  {
    name: "Chicken breast",
    location: "fridge",
    quantity: 1.3,
    unit: "lb",
    expiresOn: addDays(today, 2),
    notes: "opened, use first",
  },
  { name: "Eggs", location: "fridge", quantity: 8, unit: null, expiresOn: addDays(today, 12) },
  {
    name: "Greek yogurt",
    location: "fridge",
    quantity: 3,
    unit: "cup",
    expiresOn: addDays(today, -2),
    notes: null,
  },
  { name: "Milk", location: "fridge", quantity: 1, unit: "bottle", expiresOn: addDays(today, 1) },
  { name: "Frozen peas", location: "freezer", quantity: 0.5, unit: "bag", expiresOn: null },
  { name: "Ground beef", location: "freezer", quantity: 1.3, unit: "lb", expiresOn: null },
  { name: "Rice", location: "pantry", quantity: 4, unit: "cup", expiresOn: null },
  { name: "Soy sauce", location: "pantry", quantity: 1, unit: "bottle", expiresOn: null },
  { name: "Olive oil", location: "pantry", quantity: null, unit: null, notes: "large tin" },
  { name: "Tinned tomatoes", location: "pantry", quantity: 3, unit: "can", expiresOn: null },
].map((entry) => addInventoryItemSchema.parse(entry));

for (const entry of inventory) {
  await addInventoryItem(db, entry);
}

// A shopping list is made of items, not kitchen records. See ADR 019.
await addToShoppingList(db, "Olive oil");
const bread = await addToShoppingList(db, "Sourdough bread");
await items.toggleItemCompletionById(db, bread);

console.warn(
  `Seeded TylerOS with 2 projects, 12 items and ${inventory.length} things in the kitchen.`,
);
process.exit(0);
