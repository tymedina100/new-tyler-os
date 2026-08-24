import { describe, expect, it } from "vitest";
import { captureItemSchema, createItemSchema, tagListSchema, updateItemSchema } from "./item-schema";

const baseInput = {
  title: "  finish pantry inventory  ",
  body: "",
  kind: "task",
  status: "active",
  dueOn: "",
  projectId: "",
  tags: "",
};

describe("createItemSchema", () => {
  it("trims the title and turns blank form fields into nulls", () => {
    const result = createItemSchema.parse(baseInput);

    expect(result.title).toBe("finish pantry inventory");
    expect(result.body).toBeNull();
    expect(result.dueOn).toBeNull();
    expect(result.projectId).toBeNull();
    expect(result.tags).toEqual([]);
  });

  it("rejects an empty title", () => {
    const result = createItemSchema.safeParse({ ...baseInput, title: "   " });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Give it a title.");
  });

  it("rejects a malformed due date instead of silently dropping it", () => {
    expect(createItemSchema.safeParse({ ...baseInput, dueOn: "next friday" }).success).toBe(false);
    expect(createItemSchema.safeParse({ ...baseInput, dueOn: "2026-02-30" }).success).toBe(false);
    expect(createItemSchema.safeParse({ ...baseInput, dueOn: "2026-08-24" }).success).toBe(true);
  });

  it("treats the sentinel project value as no project", () => {
    expect(createItemSchema.parse({ ...baseInput, projectId: "none" }).projectId).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(createItemSchema.safeParse({ ...baseInput, kind: "recipe" }).success).toBe(false);
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
