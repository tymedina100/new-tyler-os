import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  compareIsoDate,
  daysBetween,
  daysInMonth,
  formatDueDate,
  formatLongDate,
  isIsoDate,
  monthsBetween,
  ordinalDayOfMonth,
  toIsoDate,
  weekdayName,
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

describe("addMonths", () => {
  it("keeps the day of the month when the month has one", () => {
    expect(addMonths("2026-08-25", 1)).toBe("2026-09-25");
    expect(addMonths("2026-08-25", 3)).toBe("2026-11-25");
    expect(addMonths("2026-08-25", 0)).toBe("2026-08-25");
  });

  it("clamps to the last day of a month that is too short", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 3)).toBe("2026-04-30");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("gets February right in a leap year", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addMonths("2024-02-29", 48)).toBe("2028-02-29");
  });

  it("crosses year boundaries in both directions", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-02-15", -3)).toBe("2025-11-15");
  });
});

describe("daysInMonth", () => {
  it("knows the short months and the leap years", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2100, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
    expect(daysInMonth(2026, 3)).toBe(30);
    expect(daysInMonth(2026, 11)).toBe(31);
  });
});

describe("monthsBetween", () => {
  it("counts whole months, ignoring the day", () => {
    expect(monthsBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(monthsBetween("2026-01-01", "2026-01-31")).toBe(0);
    expect(monthsBetween("2026-08-25", "2027-08-25")).toBe(12);
    expect(monthsBetween("2026-08-25", "2026-05-01")).toBe(-3);
  });
});

describe("weekdayName and ordinalDayOfMonth", () => {
  it("names the weekday of a date", () => {
    expect(weekdayName("2026-08-25")).toBe("Tuesday");
    expect(weekdayName("2026-08-29")).toBe("Saturday");
  });

  it("says the day of the month the way a person would", () => {
    expect(ordinalDayOfMonth("2026-08-01")).toBe("1st");
    expect(ordinalDayOfMonth("2026-08-02")).toBe("2nd");
    expect(ordinalDayOfMonth("2026-08-03")).toBe("3rd");
    expect(ordinalDayOfMonth("2026-08-04")).toBe("4th");
    expect(ordinalDayOfMonth("2026-08-11")).toBe("11th");
    expect(ordinalDayOfMonth("2026-08-12")).toBe("12th");
    expect(ordinalDayOfMonth("2026-08-13")).toBe("13th");
    expect(ordinalDayOfMonth("2026-08-21")).toBe("21st");
    expect(ordinalDayOfMonth("2026-08-22")).toBe("22nd");
    expect(ordinalDayOfMonth("2026-08-31")).toBe("31st");
  });
});
