import { describe, expect, it } from "vitest";
import { optionalRecurrenceSchema, recurrenceIntervalSchema } from "./recurrence-schema";

describe("recurrenceIntervalSchema", () => {
  it("defaults a missing or blank interval to every period", () => {
    expect(recurrenceIntervalSchema.parse(undefined)).toBe(1);
    expect(recurrenceIntervalSchema.parse(null)).toBe(1);
    expect(recurrenceIntervalSchema.parse("")).toBe(1);
    expect(recurrenceIntervalSchema.parse("  ")).toBe(1);
  });

  it("reads the number a form sends as a string", () => {
    expect(recurrenceIntervalSchema.parse("2")).toBe(2);
    expect(recurrenceIntervalSchema.parse(3)).toBe(3);
  });

  it("refuses intervals that are not a whole number of periods", () => {
    expect(() => recurrenceIntervalSchema.parse("0")).toThrow();
    expect(() => recurrenceIntervalSchema.parse("-1")).toThrow();
    expect(() => recurrenceIntervalSchema.parse("1.5")).toThrow();
    expect(() => recurrenceIntervalSchema.parse("weekly")).toThrow();
    expect(() => recurrenceIntervalSchema.parse("100")).toThrow();
  });
});

describe("optionalRecurrenceSchema", () => {
  it("reads a repeat out of the two fields a form sends", () => {
    expect(optionalRecurrenceSchema.parse({ frequency: "weekly", interval: "2" })).toEqual({
      frequency: "weekly",
      interval: 2,
    });
  });

  it("treats every way of saying 'it does not repeat' as no repeat", () => {
    expect(optionalRecurrenceSchema.parse(null)).toBeNull();
    expect(optionalRecurrenceSchema.parse(undefined)).toBeNull();
    expect(optionalRecurrenceSchema.parse({ frequency: "none", interval: "2" })).toBeNull();
    expect(optionalRecurrenceSchema.parse({ frequency: "", interval: null })).toBeNull();
    expect(optionalRecurrenceSchema.parse({ frequency: null, interval: null })).toBeNull();
  });

  it("refuses a frequency the model cannot express, rather than guessing one", () => {
    expect(() => optionalRecurrenceSchema.parse({ frequency: "yearly", interval: 1 })).toThrow();
  });

  it("fills in an interval of one when the form omits it", () => {
    expect(optionalRecurrenceSchema.parse({ frequency: "monthly" })).toEqual({
      frequency: "monthly",
      interval: 1,
    });
  });
});
