import { afterAll, beforeAll, expect, it } from "vitest";
import { updateItemSchema } from "@/domain/items/item-schema";
import * as items from "@/server/items/item-service";
import { editMobileItem } from "@/server/mobile/mobile-service";
import { createTestDatabase, type TestDatabase } from "../support/test-database";
let harness: TestDatabase;
beforeAll(async () => {
  harness = await createTestDatabase();
});
afterAll(async () => {
  await harness.close();
});

it("refuses an old web draft atomically after a mobile edit and allows a refreshed draft", async () => {
  const db = harness.db;
  const id = await items.captureItem(db, { text: "shared task #home", projectId: null });
  const before = (await items.getItem(db, id))!;
  const draft = updateItemSchema.parse({
    ...before,
    title: "web draft",
    tags: ["errand"],
    dueOn: "2026-09-10",
    recurrence: { frequency: "weekly", interval: 1 },
  });
  await editMobileItem(db, id, {
    requestId: crypto.randomUUID(),
    expectedUpdatedAt: before.updatedAt.toISOString(),
    title: "phone title",
  });
  await expect(
    items.updateItemFromSnapshot(db, draft, before.updatedAt.toISOString()),
  ).rejects.toMatchObject({ code: "conflict" });
  const current = (await items.getItem(db, id))!;
  expect(current.title).toBe("phone title");
  expect(current.tags.map((t) => t.name)).toEqual(["home"]);
  expect(current.recurrence).toBeNull();
  expect(current.dueOn).toBeNull();
  const saved = await items.updateItemFromSnapshot(db, draft, current.updatedAt.toISOString());
  expect(saved.title).toBe("web draft");
  expect(saved.updatedAt.getTime()).toBeGreaterThan(current.updatedAt.getTime());
  await expect(
    editMobileItem(db, id, {
      requestId: crypto.randomUUID(),
      expectedUpdatedAt: current.updatedAt.toISOString(),
      title: "old phone draft",
    }),
  ).rejects.toMatchObject({ code: "conflict" });
  const next = await items.updateItemFromSnapshot(
    db,
    { ...draft, title: "next web edit" },
    saved.updatedAt.toISOString(),
  );
  expect(next.title).toBe("next web edit");
});
