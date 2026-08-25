import { describe, expect, it } from "vitest";
import { normalizeUnit } from "./inventory";
import { addInventoryItemSchema, quantitySchema } from "./inventory-schema";

const VALID = {
  name: "Chicken breast",
  location: "freezer",
  quantity: "2",
  unit: "lb",
  expiresOn: "2026-09-01",
  notes: "",
};

function parse(overrides: Record<string, unknown> = {}) {
  return addInventoryItemSchema.parse({ ...VALID, ...overrides });
}

describe("addInventoryItemSchema", () => {
  it("accepts the full form", () => {
    expect(parse()).toEqual({
      name: "Chicken breast",
      location: "freezer",
      quantity: 2,
      unit: "lb",
      expiresOn: "2026-09-01",
      notes: null,
    });
  });

  it("accepts the fastest valid entry: a name and a location", () => {
    expect(parse({ quantity: "", unit: "", expiresOn: "", notes: "" })).toEqual({
      name: "Chicken breast",
      location: "freezer",
      quantity: null,
      unit: null,
      expiresOn: null,
      notes: null,
    });
  });

  it("trims the name", () => {
    expect(parse({ name: "  Rice  " }).name).toBe("Rice");
  });

  it.each(["", "   "])("refuses a blank name (%j)", (name) => {
    expect(() => parse({ name })).toThrow(/name/i);
  });

  it("refuses a location it does not have", () => {
    expect(() => parse({ location: "garage" })).toThrow(/location/i);
  });

  it.each(["fridge", "freezer", "pantry"])("accepts %s", (location) => {
    expect(parse({ location }).location).toBe(location);
  });

  it("refuses an invalid date rather than storing nonsense", () => {
    expect(() => parse({ expiresOn: "2026-02-31" })).toThrow(/valid date/i);
    expect(() => parse({ expiresOn: "next tuesday" })).toThrow(/valid date/i);
  });

  it("keeps notes when they are given", () => {
    expect(parse({ notes: "  back of the top shelf  " }).notes).toBe("back of the top shelf");
  });
});

describe("quantity", () => {
  it.each([
    ["2", 2],
    ["1.3", 1.3],
    ["0.5", 0.5],
    ["0", 0],
    ["8", 8],
  ])("accepts %j as %s", (input, expected) => {
    expect(quantitySchema.parse(input)).toBe(expected);
  });

  it("treats blank as unknown rather than zero", () => {
    // The difference between an uncounted bag of rice and an empty one.
    expect(quantitySchema.parse("")).toBeNull();
    expect(quantitySchema.parse("   ")).toBeNull();
    expect(quantitySchema.parse(null)).toBeNull();
  });

  it("allows zero, which means the food is gone but the record is kept", () => {
    expect(quantitySchema.parse("0")).toBe(0);
  });

  it("refuses a negative quantity", () => {
    expect(() => quantitySchema.parse("-1")).toThrow(/negative/i);
  });

  it("refuses text that is not a number", () => {
    expect(() => quantitySchema.parse("loads")).toThrow(/number/i);
  });

  it("refuses a quantity no kitchen holds", () => {
    expect(() => quantitySchema.parse("999999999")).toThrow();
  });

  it("rounds to the precision it will actually be stored at", () => {
    expect(quantitySchema.parse("1.333333")).toBe(1.33);
  });
});

describe("normalizeUnit", () => {
  it.each([
    ["lb", "lb"],
    ["LB", "lb"],
    ["  Lb  ", "lb"],
    ["bottle", "bottle"],
  ])("normalises %j to %j", (input, expected) => {
    expect(normalizeUnit(input)).toBe(expected);
  });

  it("treats a blank unit as no unit", () => {
    expect(normalizeUnit("")).toBeNull();
    expect(normalizeUnit("   ")).toBeNull();
  });

  it("leaves an ordinary human word alone rather than guessing at it", () => {
    // "lbs" is not silently turned into "lb": guessing is how an inventory
    // stops being trustworthy.
    expect(normalizeUnit("lbs")).toBe("lbs");
    expect(normalizeUnit("handful")).toBe("handful");
  });
});
