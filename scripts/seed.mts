import "dotenv/config";
import { addDays, todayIsoDate } from "@/domain/shared/date";
import { getDb } from "@/server/db/client";
import * as items from "@/server/items/item-service";
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

console.warn("Seeded TylerOS with 2 projects and 10 items.");
process.exit(0);
