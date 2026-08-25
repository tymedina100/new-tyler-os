import { describe, expect, it } from "vitest";
import {
  captureItemSchema,
  itemFieldsSchema,
  tagListSchema,
  updateItemSchema,
} from "./item-schema";

const baseInput = {
  title: "  finish pantry inventory  ",
  body: "",
  kind: "task",
  status: "active",
  dueOn: "",
  projectId: "",
  tags: "",
};

describe("itemFieldsSchema", () => {
  it("trims the title and turns blank form fields into nulls", () => {
    const result = itemFieldsSchema.parse(baseInput);

    expect(result.title).toBe("finish pantry inventory");
    expect(result.body).toBeNull();
    expect(result.dueOn).toBeNull();
    expect(result.projectId).toBeNull();
    expect(result.tags).toEqual([]);
  });

  it("rejects an empty title", () => {
    const result = itemFieldsSchema.safeParse({ ...baseInput, title: "   " });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Give it a title.");
  });

  it("rejects a malformed due date instead of silently dropping it", () => {
    expect(itemFieldsSchema.safeParse({ ...baseInput, dueOn: "next friday" }).success).toBe(false);
    expect(itemFieldsSchema.safeParse({ ...baseInput, dueOn: "2026-02-30" }).success).toBe(false);
    expect(itemFieldsSchema.safeParse({ ...baseInput, dueOn: "2026-08-24" }).success).toBe(true);
  });

  it("treats the sentinel project value as no project", () => {
    expect(itemFieldsSchema.parse({ ...baseInput, projectId: "none" }).projectId).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(itemFieldsSchema.safeParse({ ...baseInput, kind: "recipe" }).success).toBe(false);
  });
});

describe("updateItemSchema", () => {
  it("requires an item id", () => {
    expect(updateItemSchema.safeParse(baseInput).success).toBe(false);
    expect(
      updateItemSchema.safeParse({
        ...baseInput,
        id: "b1f0d0b6-2c9d-4f9c-9b2a-0f0a1c2d3e4f",
      }).success,
    ).toBe(true);
  });
});

describe("tagListSchema", () => {
  it("accepts a comma or space separated string from a form field", () => {
    expect(tagListSchema.parse("home, errand  kitchen")).toEqual(["home", "errand", "kitchen"]);
  });

  it("accepts an array and normalises it", () => {
    expect(tagListSchema.parse(["Home", " HOME ", "meal prep"])).toEqual(["home", "meal-prep"]);
  });

  it("treats a missing value as no tags", () => {
    expect(tagListSchema.parse(null)).toEqual([]);
    expect(tagListSchema.parse(undefined)).toEqual([]);
  });

  it("rejects more tags than an item should carry", () => {
    expect(tagListSchema.safeParse("a b c d e f g h i").success).toBe(false);
  });
});

describe("captureItemSchema", () => {
  it("requires something to capture", () => {
    expect(captureItemSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(captureItemSchema.safeParse({ text: "watch Severance" }).success).toBe(true);
  });
});

describe("updateItemSchema and repeats", () => {
  const id = "00000000-0000-4000-8000-000000000000";
  const repeating = {
    ...baseInput,
    id,
    dueOn: "2026-08-25",
    recurrence: { frequency: "weekly", interval: "2" },
  };

  it("reads a repeat out of the two fields the form sends", () => {
    const result = updateItemSchema.parse(repeating);
    expect(result.recurrence).toEqual({ frequency: "weekly", interval: 2 });
  });

  it("treats an item with no repeat as the ordinary case", () => {
    const result = updateItemSchema.parse({ ...baseInput, id, recurrence: { frequency: "none" } });
    expect(result.recurrence).toBeNull();
  });

  it("refuses a repeat with no date, because that is not a schedule", () => {
    const result = updateItemSchema.safeParse({ ...repeating, dueOn: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["dueOn"]);
  });

  it("refuses to mark a repeating item done, since only an occurrence is done", () => {
    const result = updateItemSchema.safeParse({ ...repeating, status: "done" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["status"]);
  });

  it("still allows a non-repeating item to be marked done", () => {
    expect(
      updateItemSchema.safeParse({ ...baseInput, id, status: "done", recurrence: null }).success,
    ).toBe(true);
  });
});
