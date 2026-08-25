import { describe, expect, it } from "vitest";
import {
  addDays,
  compareIsoDate,
  daysBetween,
  formatDueDate,
  formatLongDate,
  isIsoDate,
  toIsoDate,
} from "./date";

describe("toIsoDate", () => {
  it("uses local calendar components rather than UTC", () => {
    // 23:30 local on the 24th must stay the 24th, whatever the host timezone is.
    expect(toIsoDate(new Date(2026, 7, 24, 23, 30))).toBe("2026-08-24");
    expect(toIsoDate(new Date(2026, 0, 1, 0, 15))).toBe("2026-01-01");
  });
});

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-08-24")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    expect(isIsoDate("2026-8-24")).toBe(false);
    expect(isIsoDate("24-08-2026")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("addDays and daysBetween", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-08-24", "2026-08-31")).toBe(7);
    expect(daysBetween("2026-08-24", "2026-08-21")).toBe(-3);
  });

  it("is unaffected by daylight saving transitions", () => {
    // US DST ends 2026-11-01; a naive millisecond division reports 0.958 days.
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("compareIsoDate", () => {
  it("orders dates chronologically", () => {
    expect(compareIsoDate("2026-08-24", "2026-09-01")).toBe(-1);
    expect(compareIsoDate("2026-09-01", "2026-08-24")).toBe(1);
    expect(compareIsoDate("2026-08-24", "2026-08-24")).toBe(0);
  });
});

describe("formatDueDate", () => {
  const today = "2026-08-24";

  it("names the days closest to now", () => {
    expect(formatDueDate("2026-08-24", today)).toBe("Today");
    expect(formatDueDate("2026-08-25", today)).toBe("Tomorrow");
    expect(formatDueDate("2026-08-23", today)).toBe("Yesterday");
  });

  it("uses weekdays inside the coming week", () => {
    expect(formatDueDate("2026-08-27", today)).toBe("Thursday");
  });

  it("counts back over the recent past", () => {
    expect(formatDueDate("2026-08-20", today)).toBe("4 days ago");
  });

  it("falls back to a calendar date further out", () => {
    expect(formatDueDate("2026-12-01", today)).toBe("Dec 1");
    expect(formatDueDate("2027-01-05", today)).toBe("Jan 5, 2027");
  });
});

describe("formatLongDate", () => {
  it("reads as a heading", () => {
    expect(formatLongDate("2026-08-24")).toBe("Monday, August 24");
    expect(formatLongDate("2027-01-01")).toBe("Friday, January 1");
  });
});
