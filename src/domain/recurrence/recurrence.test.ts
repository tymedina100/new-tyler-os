import { describe, expect, it } from "vitest";
import type { ItemRecurrence } from "./recurrence";
import {
  describeRecurrence,
  isRecurrenceFrequency,
  RECURRENCE_PRESETS,
  summarizeRecurrence,
} from "./recurrence";

function every(overrides: Partial<ItemRecurrence> = {}): ItemRecurrence {
  return {
    frequency: "weekly",
    interval: 1,
    anchorOn: "2026-08-25",
    lastCompletedOn: null,
    ...overrides,
  };
}

describe("describeRecurrence", () => {
  it("names the weekday, because 'every 2 weeks' alone is not trustworthy", () => {
    expect(describeRecurrence(every())).toBe("Every Tuesday");
    expect(describeRecurrence(every({ interval: 2 }))).toBe("Every 2 weeks on Tuesday");
    expect(describeRecurrence(every({ anchorOn: "2026-08-29" }))).toBe("Every Saturday");
  });

  it("reads a daily repeat as a person would say it", () => {
    expect(describeRecurrence(every({ frequency: "daily" }))).toBe("Every day");
    expect(describeRecurrence(every({ frequency: "daily", interval: 2 }))).toBe("Every 2 days");
  });

  it("names the day of the month for a monthly repeat", () => {
    expect(describeRecurrence(every({ frequency: "monthly", anchorOn: "2026-09-01" }))).toBe(
      "Monthly on the 1st",
    );
    expect(
      describeRecurrence(every({ frequency: "monthly", interval: 3, anchorOn: "2026-09-22" })),
    ).toBe("Every 3 months on the 22nd");
    expect(describeRecurrence(every({ frequency: "monthly", anchorOn: "2026-01-31" }))).toBe(
      "Monthly on the 31st",
    );
  });

  it("describes the anchor, not the clamped occurrence", () => {
    // The item may currently be due on February 28th; the schedule is still
    // the 31st, and saying so is what stops the user "fixing" it.
    expect(describeRecurrence(every({ frequency: "monthly", anchorOn: "2026-01-31" }))).toBe(
      "Monthly on the 31st",
    );
  });
});

describe("summarizeRecurrence", () => {
  it("is short enough for a badge", () => {
    expect(summarizeRecurrence({ frequency: "daily", interval: 1 })).toBe("Daily");
    expect(summarizeRecurrence({ frequency: "weekly", interval: 1 })).toBe("Weekly");
    expect(summarizeRecurrence({ frequency: "monthly", interval: 1 })).toBe("Monthly");
    expect(summarizeRecurrence({ frequency: "weekly", interval: 2 })).toBe("Every 2 weeks");
    expect(summarizeRecurrence({ frequency: "monthly", interval: 3 })).toBe("Every 3 months");
  });
});

describe("isRecurrenceFrequency", () => {
  it("recognises only the three the model has", () => {
    expect(isRecurrenceFrequency("weekly")).toBe(true);
    expect(isRecurrenceFrequency("yearly")).toBe(false);
    expect(isRecurrenceFrequency("none")).toBe(false);
    expect(isRecurrenceFrequency("")).toBe(false);
  });
});

describe("RECURRENCE_PRESETS", () => {
  it("labels each preset the way it is described", () => {
    for (const preset of RECURRENCE_PRESETS) {
      expect(summarizeRecurrence(preset)).toBe(preset.label);
    }
  });
});
