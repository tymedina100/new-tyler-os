import { describe, expect, it } from "vitest";
import type { InventoryItem } from "./inventory";
import {
  bucketExpiry,
  compareInventoryForDisplay,
  EXPIRING_SOON_DAYS,
  formatQuantity,
  needsUsingSoon,
  shoppingTextFor,
} from "./inventory-rules";

/** Fixed. A test that asks the clock what "soon" means passes only today. */
const TODAY = "2026-08-25";

function inventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "i-1",
    name: "Chicken breast",
    location: "freezer",
    quantity: 2,
    unit: "lb",
    expiresOn: null,
    notes: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("bucketExpiry", () => {
  it("has nothing to say about food with no date", () => {
    expect(bucketExpiry(null, TODAY)).toBe("none");
  });

  it.each([
    ["2026-08-24", "expired"],
    ["2026-07-01", "expired"],
    ["2026-08-25", "soon"],
    ["2026-08-26", "soon"],
    ["2026-08-28", "soon"],
    ["2026-08-29", "later"],
    ["2027-01-01", "later"],
  ])("buckets %s as %s", (expiresOn, expected) => {
    expect(bucketExpiry(expiresOn, TODAY)).toBe(expected);
  });

  it("treats today as soon rather than expired", () => {
    // Food that goes off today is still food today.
    expect(bucketExpiry(TODAY, TODAY)).toBe("soon");
  });

  it("puts the boundary exactly at the documented window", () => {
    const lastSoonDay = "2026-08-28";
    const firstLaterDay = "2026-08-29";

    expect(EXPIRING_SOON_DAYS).toBe(3);
    expect(bucketExpiry(lastSoonDay, TODAY)).toBe("soon");
    expect(bucketExpiry(firstLaterDay, TODAY)).toBe("later");
  });

  it("crosses a month boundary without drifting", () => {
    expect(bucketExpiry("2026-09-01", "2026-08-30")).toBe("soon");
    expect(bucketExpiry("2026-09-03", "2026-08-30")).toBe("later");
  });
});

describe("needsUsingSoon", () => {
  it.each([
    ["2026-08-20", true],
    ["2026-08-25", true],
    ["2026-08-28", true],
    ["2026-08-29", false],
  ])("is %s -> %s", (expiresOn, expected) => {
    expect(needsUsingSoon(expiresOn, TODAY)).toBe(expected);
  });

  it("never flags food with no date", () => {
    expect(needsUsingSoon(null, TODAY)).toBe(false);
  });
});

describe("formatQuantity", () => {
  it.each([
    [2, "lb", "2 lb"],
    [1.3, "lb", "1.3 lb"],
    [0.5, "bag", "0.5 bag"],
    [3, "cup", "3 cup"],
    [1, "bottle", "1 bottle"],
  ])("renders a measured amount: %s %s", (quantity, unit, expected) => {
    expect(formatQuantity(quantity, unit)).toBe(expected);
  });

  it("renders a bare count with no unit", () => {
    expect(formatQuantity(8, null)).toBe("8");
  });

  it("says Some when nobody counted", () => {
    expect(formatQuantity(null, null)).toBe("Some");
  });

  it("keeps the unit when the amount is unknown", () => {
    expect(formatQuantity(null, "bottle")).toBe("Some bottle");
  });

  it("says Out rather than showing a zero", () => {
    expect(formatQuantity(0, "lb")).toBe("Out");
    expect(formatQuantity(0, null)).toBe("Out");
  });

  it("drops trailing zeroes rather than showing false precision", () => {
    expect(formatQuantity(2.0, "lb")).toBe("2 lb");
    expect(formatQuantity(1.5, "lb")).toBe("1.5 lb");
    expect(formatQuantity(1.25, "kg")).toBe("1.25 kg");
  });

  it("does not accumulate floating point noise", () => {
    expect(formatQuantity(0.1 + 0.2, "l")).toBe("0.3 l");
  });
});

describe("compareInventoryForDisplay", () => {
  it("puts the soonest expiry first", () => {
    const soon = inventoryItem({ name: "Milk", expiresOn: "2026-08-26" });
    const later = inventoryItem({ name: "Cheese", expiresOn: "2026-09-10" });

    expect([later, soon].sort(compareInventoryForDisplay).map((i) => i.name)).toEqual([
      "Milk",
      "Cheese",
    ]);
  });

  it("puts undated food after anything with a date", () => {
    const dated = inventoryItem({ name: "Yoghurt", expiresOn: "2026-12-01" });
    const undated = inventoryItem({ name: "Rice", expiresOn: null });

    expect([undated, dated].sort(compareInventoryForDisplay).map((i) => i.name)).toEqual([
      "Yoghurt",
      "Rice",
    ]);
  });

  it("falls back to the name so the order never wobbles", () => {
    const a = inventoryItem({ name: "Apples", expiresOn: "2026-08-30" });
    const b = inventoryItem({ name: "Bacon", expiresOn: "2026-08-30" });

    expect([b, a].sort(compareInventoryForDisplay).map((i) => i.name)).toEqual(["Apples", "Bacon"]);
  });

  it("orders two packages of the same food by date, keeping both", () => {
    const older = inventoryItem({ id: "a", name: "Chicken breast", expiresOn: "2026-08-27" });
    const newer = inventoryItem({ id: "b", name: "Chicken breast", expiresOn: "2026-09-05" });

    const sorted = [newer, older].sort(compareInventoryForDisplay);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("shoppingTextFor", () => {
  it("is just the name when there is no unit to carry", () => {
    expect(shoppingTextFor("Milk", null)).toBe("Milk");
  });

  it("carries the unit so the shopping line means something", () => {
    expect(shoppingTextFor("Chicken breast", "lb")).toBe("Chicken breast (lb)");
  });
});
