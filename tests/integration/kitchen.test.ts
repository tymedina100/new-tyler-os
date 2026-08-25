import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AddInventoryItemInput } from "@/domain/kitchen/inventory-schema";
import * as itemService from "@/server/items/item-service";
import * as kitchen from "@/server/kitchen/inventory-service";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

/**
 * What only the database can prove: that a decimal survives the round trip
 * through `numeric`, that ordering puts the soonest expiry first with undated
 * food last, and that "used it up" really does reach across into the item spine.
 */

let harness: TestDatabase;

beforeAll(async () => {
  harness = await createTestDatabase();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

function db() {
  return harness.db;
}

function entry(overrides: Partial<AddInventoryItemInput> = {}): AddInventoryItemInput {
  return {
    name: "Chicken breast",
    location: "freezer",
    quantity: 2,
    unit: "lb",
    expiresOn: null,
    notes: null,
    ...overrides,
  };
}

describe("adding inventory", () => {
  it("stores the whole record", async () => {
    const id = await kitchen.addInventoryItem(
      db(),
      entry({ expiresOn: "2026-09-01", notes: "bottom drawer" }),
    );
    const item = await kitchen.getInventoryItem(db(), id);

    expect(item).toMatchObject({
      name: "Chicken breast",
      location: "freezer",
      quantity: 2,
      unit: "lb",
      expiresOn: "2026-09-01",
      notes: "bottom drawer",
    });
  });

  it("accepts the fastest entry: a name and a location", async () => {
    const id = await kitchen.addInventoryItem(
      db(),
      entry({ name: "Rice", location: "pantry", quantity: null, unit: null }),
    );
    const item = await kitchen.getInventoryItem(db(), id);

    expect(item).toMatchObject({ name: "Rice", location: "pantry", quantity: null, unit: null });
  });

  it("round-trips a decimal quantity through numeric as a number", async () => {
    // numeric() returns a string by default; the column is configured to hand
    // back a JS number so 1.3 lb never becomes "1.30" or 1.3000000000000003.
    const id = await kitchen.addInventoryItem(db(), entry({ quantity: 1.3 }));
    const item = await kitchen.getInventoryItem(db(), id);

    expect(item?.quantity).toBe(1.3);
    expect(typeof item?.quantity).toBe("number");
  });

  it("keeps zero distinct from unknown", async () => {
    const empty = await kitchen.addInventoryItem(db(), entry({ name: "Milk", quantity: 0 }));
    const uncounted = await kitchen.addInventoryItem(db(), entry({ name: "Rice", quantity: null }));

    expect((await kitchen.getInventoryItem(db(), empty))?.quantity).toBe(0);
    expect((await kitchen.getInventoryItem(db(), uncounted))?.quantity).toBeNull();
  });

  it("keeps two packages of the same food as two records", async () => {
    await kitchen.addInventoryItem(db(), entry({ expiresOn: "2026-08-27" }));
    await kitchen.addInventoryItem(db(), entry({ expiresOn: "2026-09-05" }));

    const all = await kitchen.listInventory(db());
    expect(all).toHaveLength(2);
    expect(all.map((i) => i.expiresOn)).toEqual(["2026-08-27", "2026-09-05"]);
  });
});

describe("listing", () => {
  beforeEach(async () => {
    await kitchen.addInventoryItem(db(), entry({ name: "Milk", location: "fridge" }));
    await kitchen.addInventoryItem(db(), entry({ name: "Peas", location: "freezer" }));
    await kitchen.addInventoryItem(db(), entry({ name: "Rice", location: "pantry" }));
  });

  it("returns everything when nothing is filtered", async () => {
    expect(await kitchen.listInventory(db())).toHaveLength(3);
  });

  it.each(["fridge", "freezer", "pantry"] as const)("filters to %s", async (location) => {
    const rows = await kitchen.listInventory(db(), { location });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.location).toBe(location);
  });

  it("counts what is in each location", async () => {
    await kitchen.addInventoryItem(db(), entry({ name: "Butter", location: "fridge" }));
    const counts = await kitchen.countInventoryByLocation(db());

    expect(counts.get("fridge")).toBe(2);
    expect(counts.get("freezer")).toBe(1);
    expect(counts.get("pantry")).toBe(1);
  });

  it("puts the soonest expiry first and undated food last", async () => {
    await harness.truncate();
    await kitchen.addInventoryItem(db(), entry({ name: "Undated", expiresOn: null }));
    await kitchen.addInventoryItem(db(), entry({ name: "Later", expiresOn: "2026-12-01" }));
    await kitchen.addInventoryItem(db(), entry({ name: "Sooner", expiresOn: "2026-08-26" }));

    const names = (await kitchen.listInventory(db())).map((i) => i.name);
    expect(names).toEqual(["Sooner", "Later", "Undated"]);
  });

  it("orders undated food by name rather than by insertion", async () => {
    await harness.truncate();
    await kitchen.addInventoryItem(db(), entry({ name: "Zucchini", expiresOn: null }));
    await kitchen.addInventoryItem(db(), entry({ name: "Almonds", expiresOn: null }));

    expect((await kitchen.listInventory(db())).map((i) => i.name)).toEqual(["Almonds", "Zucchini"]);
  });
});

describe("searching", () => {
  beforeEach(async () => {
    await kitchen.addInventoryItem(db(), entry({ name: "Chicken breast", location: "freezer" }));
    await kitchen.addInventoryItem(
      db(),
      entry({ name: "Greek yogurt", location: "fridge", notes: "for the chicken curry" }),
    );
    await kitchen.addInventoryItem(db(), entry({ name: "Rice", location: "pantry" }));
  });

  it("finds a partial word, which is what a short product name needs", async () => {
    const found = await kitchen.findInventory(db(), "chick");
    expect(found.map((i) => i.name)).toContain("Chicken breast");
  });

  it("is case-insensitive", async () => {
    expect(await kitchen.findInventory(db(), "CHICKEN")).not.toHaveLength(0);
  });

  it("searches notes as well as names", async () => {
    const found = await kitchen.findInventory(db(), "curry");
    expect(found.map((i) => i.name)).toEqual(["Greek yogurt"]);
  });

  it("returns nothing for a blank query rather than everything", async () => {
    expect(await kitchen.findInventory(db(), "   ")).toEqual([]);
  });

  it("treats a wildcard as a literal, not as a pattern", async () => {
    expect(await kitchen.findInventory(db(), "%")).toEqual([]);
  });

  it("matches every word, in whatever order they were typed", async () => {
    // Nobody remembers which word came first on the pot.
    expect((await kitchen.findInventory(db(), "greek yogurt")).map((i) => i.name)).toEqual([
      "Greek yogurt",
    ]);
    expect((await kitchen.findInventory(db(), "yogurt greek")).map((i) => i.name)).toEqual([
      "Greek yogurt",
    ]);
  });

  it("requires all the words, so extra terms narrow rather than widen", async () => {
    expect(await kitchen.findInventory(db(), "chicken rice")).toEqual([]);
  });
});

describe("expiring soon", () => {
  it("returns expired and nearly-expired food, and nothing else", async () => {
    const now = new Date(2026, 7, 25);

    await kitchen.addInventoryItem(db(), entry({ name: "Expired", expiresOn: "2026-08-20" }));
    await kitchen.addInventoryItem(db(), entry({ name: "Today", expiresOn: "2026-08-25" }));
    await kitchen.addInventoryItem(db(), entry({ name: "Edge", expiresOn: "2026-08-28" }));
    await kitchen.addInventoryItem(db(), entry({ name: "Later", expiresOn: "2026-08-29" }));
    await kitchen.addInventoryItem(db(), entry({ name: "Undated", expiresOn: null }));

    const { today, items } = await kitchen.getExpiringSoon(db(), now);

    expect(today).toBe("2026-08-25");
    expect(items.map((i) => i.name)).toEqual(["Expired", "Today", "Edge"]);
  });
});

describe("updating", () => {
  it("changes quantity without touching anything else", async () => {
    const id = await kitchen.addInventoryItem(db(), entry({ quantity: 2 }));
    await kitchen.setInventoryQuantity(db(), id, 0.5);

    const item = await kitchen.getInventoryItem(db(), id);
    expect(item?.quantity).toBe(0.5);
    expect(item?.unit).toBe("lb");
  });

  it("moves an item between locations", async () => {
    const id = await kitchen.addInventoryItem(db(), entry({ location: "freezer" }));
    await kitchen.setInventoryLocation(db(), id, "fridge");

    expect((await kitchen.getInventoryItem(db(), id))?.location).toBe("fridge");
    expect(await kitchen.listInventory(db(), { location: "freezer" })).toEqual([]);
  });

  it("clears a quantity back to unknown", async () => {
    const id = await kitchen.addInventoryItem(db(), entry({ quantity: 2 }));
    await kitchen.setInventoryQuantity(db(), id, null);

    expect((await kitchen.getInventoryItem(db(), id))?.quantity).toBeNull();
  });

  it("replaces the whole record through the editor", async () => {
    const id = await kitchen.addInventoryItem(db(), entry());
    await kitchen.updateInventoryItem(db(), {
      id,
      name: "Chicken thighs",
      location: "fridge",
      quantity: 1.5,
      unit: "kg",
      expiresOn: "2026-09-09",
      notes: "marinating",
    });

    expect(await kitchen.getInventoryItem(db(), id)).toMatchObject({
      name: "Chicken thighs",
      location: "fridge",
      quantity: 1.5,
      unit: "kg",
      expiresOn: "2026-09-09",
      notes: "marinating",
    });
  });

  it("refuses to update something that is gone", async () => {
    await expect(
      kitchen.setInventoryQuantity(db(), "00000000-0000-4000-8000-000000000000", 1),
    ).rejects.toThrow(/not found/i);
  });
});

describe("removing", () => {
  it("deletes a mistaken record and adds nothing to shopping", async () => {
    const id = await kitchen.addInventoryItem(db(), entry());
    await kitchen.deleteInventoryItem(db(), id);

    expect(await kitchen.getInventoryItem(db(), id)).toBeNull();
    expect(await itemService.listItemsForView(db(), { kinds: ["purchase"] })).toEqual([]);
  });

  it("refuses to delete something that is already gone", async () => {
    await expect(
      kitchen.deleteInventoryItem(db(), "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/not found/i);
  });

  it("using something up removes it and puts it on the shopping list", async () => {
    const id = await kitchen.addInventoryItem(db(), entry({ name: "Milk", unit: "bottle" }));
    const result = await kitchen.markInventoryUsedUp(db(), id);

    expect(result.name).toBe("Milk");
    expect(await kitchen.getInventoryItem(db(), id)).toBeNull();

    const shopping = await itemService.listItemsForView(db(), { kinds: ["purchase"] });
    expect(shopping.map((i) => i.title)).toEqual(["Milk (bottle)"]);
  });

  it("carries no unit onto the shopping line when there was none", async () => {
    const id = await kitchen.addInventoryItem(db(), entry({ name: "Eggs", unit: null }));
    await kitchen.markInventoryUsedUp(db(), id);

    const shopping = await itemService.listItemsForView(db(), { kinds: ["purchase"] });
    expect(shopping.map((i) => i.title)).toEqual(["Eggs"]);
  });
});

describe("the shopping list", () => {
  it("is made of items, so capture rules still apply to it", async () => {
    await kitchen.addToShoppingList(db(), "Olive oil #cooking");

    const shopping = await itemService.listItemsForView(db(), { kinds: ["purchase"] });
    expect(shopping).toHaveLength(1);
    expect(shopping[0]?.title).toBe("Olive oil");
    expect(shopping[0]?.tags.map((tag) => tag.name)).toEqual(["cooking"]);
  });

  it("is triaged out of the inbox, because buying it is already the decision", async () => {
    await kitchen.addToShoppingList(db(), "Butter");

    const shopping = await itemService.listItemsForView(db(), { kinds: ["purchase"] });
    expect(shopping[0]?.status).toBe("active");
  });

  it("is marked purchased with the ordinary completion toggle", async () => {
    const id = await kitchen.addToShoppingList(db(), "Bread");
    await itemService.toggleItemCompletionById(db(), id);

    expect((await itemService.getItem(db(), id))?.status).toBe("done");
  });

  it("is findable by the existing item search, with no kitchen query involved", async () => {
    await kitchen.addToShoppingList(db(), "Sourdough bread");

    const found = await itemService.findItems(db(), "sourdough", {});
    expect(found.map((i) => i.title)).toEqual(["Sourdough bread"]);
  });
});
