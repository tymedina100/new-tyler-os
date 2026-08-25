import { describe, expect, it } from "vitest";
import type { ItemRecurrence } from "./recurrence";
import {
  completeOccurrence,
  nextOccurrenceAfter,
  occurrenceOn,
  occurrencesBetween,
  resolveAnchor,
  skipOccurrence,
  startingOccurrence,
} from "./recurrence-rules";

/** A Tuesday, so "every Tuesday" reads as itself throughout these tests. */
const TUESDAY = "2026-08-25";

function every(overrides: Partial<ItemRecurrence> = {}): ItemRecurrence {
  return {
    frequency: "weekly",
    interval: 1,
    anchorOn: TUESDAY,
    lastCompletedOn: null,
    ...overrides,
  };
}

describe("occurrenceOn", () => {
  it("counts days, weeks and months from the anchor", () => {
    expect(occurrenceOn(every({ frequency: "daily" }), 3)).toBe("2026-08-28");
    expect(occurrenceOn(every(), 2)).toBe("2026-09-08");
    expect(occurrenceOn(every({ frequency: "weekly", interval: 2 }), 1)).toBe("2026-09-08");
    expect(occurrenceOn(every({ frequency: "monthly" }), 3)).toBe("2026-11-25");
  });

  it("returns the anchor itself at index zero", () => {
    expect(occurrenceOn(every(), 0)).toBe(TUESDAY);
    expect(occurrenceOn(every({ frequency: "monthly", interval: 3 }), 0)).toBe(TUESDAY);
  });

  it("keeps a monthly repeat on its day rather than letting the clamp drag it back", () => {
    const monthly = every({ frequency: "monthly", anchorOn: "2026-01-31" });

    // February has no 31st, so that one occurrence clamps - and only that one.
    expect(occurrenceOn(monthly, 1)).toBe("2026-02-28");
    expect(occurrenceOn(monthly, 2)).toBe("2026-03-31");
    expect(occurrenceOn(monthly, 3)).toBe("2026-04-30");
    expect(occurrenceOn(monthly, 4)).toBe("2026-05-31");
  });

  it("handles a repeat anchored on a leap day", () => {
    const yearly = every({ frequency: "monthly", interval: 12, anchorOn: "2024-02-29" });

    expect(occurrenceOn(yearly, 1)).toBe("2025-02-28");
    expect(occurrenceOn(yearly, 2)).toBe("2026-02-28");
    expect(occurrenceOn(yearly, 4)).toBe("2028-02-29");
  });

  it("refuses an index that is not a whole number from zero", () => {
    expect(() => occurrenceOn(every(), -1)).toThrow();
    expect(() => occurrenceOn(every(), 1.5)).toThrow();
  });
});

describe("nextOccurrenceAfter", () => {
  it("is strictly after, so an occurrence is never its own successor", () => {
    expect(nextOccurrenceAfter(every(), TUESDAY)).toBe("2026-09-01");
    expect(nextOccurrenceAfter(every(), "2026-08-24")).toBe(TUESDAY);
  });

  it("returns the anchor when the whole series is still ahead", () => {
    expect(nextOccurrenceAfter(every({ anchorOn: "2026-09-01" }), TUESDAY)).toBe("2026-09-01");
  });

  it("respects an interval of more than one period", () => {
    const fortnightly = every({ interval: 2 });

    expect(nextOccurrenceAfter(fortnightly, TUESDAY)).toBe("2026-09-08");
    expect(nextOccurrenceAfter(fortnightly, "2026-09-07")).toBe("2026-09-08");
    expect(nextOccurrenceAfter(fortnightly, "2026-09-08")).toBe("2026-09-22");
  });

  it("skips straight past a long gap rather than stepping through it", () => {
    const daily = every({ frequency: "daily" });

    expect(nextOccurrenceAfter(daily, "2027-03-14")).toBe("2027-03-15");
    expect(nextOccurrenceAfter(every(), "2027-03-14")).toBe("2027-03-16");
  });

  it("lands on the right side of a clamped month", () => {
    const monthly = every({ frequency: "monthly", anchorOn: "2026-01-31" });

    expect(nextOccurrenceAfter(monthly, "2026-02-27")).toBe("2026-02-28");
    expect(nextOccurrenceAfter(monthly, "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrenceAfter(monthly, "2026-03-31")).toBe("2026-04-30");
  });

  it("works for a quarterly repeat", () => {
    const quarterly = every({ frequency: "monthly", interval: 3, anchorOn: "2026-02-15" });

    expect(nextOccurrenceAfter(quarterly, "2026-02-15")).toBe("2026-05-15");
    expect(nextOccurrenceAfter(quarterly, "2026-06-01")).toBe("2026-08-15");
  });
});

describe("occurrencesBetween", () => {
  it("lists every occurrence inside the window, both ends included", () => {
    expect(occurrencesBetween(every(), "2026-09-01", "2026-09-15")).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
    ]);
  });

  it("starts from the anchor when the window opens before the series does", () => {
    expect(occurrencesBetween(every({ anchorOn: "2026-09-08" }), TUESDAY, "2026-09-20")).toEqual([
      "2026-09-08",
      "2026-09-15",
    ]);
  });

  it("returns nothing for an empty or inverted window", () => {
    expect(occurrencesBetween(every(), "2026-08-26", "2026-08-31")).toEqual([]);
    expect(occurrencesBetween(every(), "2026-09-15", "2026-09-01")).toEqual([]);
  });

  it("stops at the limit rather than building a list nobody reads", () => {
    const daily = every({ frequency: "daily" });
    expect(occurrencesBetween(daily, TUESDAY, "2026-12-31", 5)).toHaveLength(5);
  });

  it("projects a monthly repeat without drifting", () => {
    const monthly = every({ frequency: "monthly", anchorOn: "2026-01-31" });
    expect(occurrencesBetween(monthly, "2026-02-01", "2026-05-01")).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });
});

describe("completeOccurrence", () => {
  it("moves to the next scheduled date and records when it was done", () => {
    expect(completeOccurrence(every(), TUESDAY, TUESDAY)).toEqual({
      dueOn: "2026-09-01",
      lastCompletedOn: TUESDAY,
    });
  });

  it("stays anchored to the schedule when it is done late", () => {
    // Bins missed on Tuesday and taken out on Thursday. Bin day is still Tuesday.
    expect(completeOccurrence(every(), TUESDAY, "2026-08-27").dueOn).toBe("2026-09-01");
  });

  it("does not queue up the periods that were missed", () => {
    // Three bin days went by. Doing it once clears it once, and the next one is
    // the next real Tuesday - not three phantom catch-ups.
    expect(completeOccurrence(every(), TUESDAY, "2026-09-17").dueOn).toBe("2026-09-22");
  });

  it("consumes the current occurrence when it is done early", () => {
    // Done on the Sunday before. The answer must not be this Tuesday again.
    expect(completeOccurrence(every(), TUESDAY, "2026-08-23").dueOn).toBe("2026-09-01");
  });

  it("keeps a monthly repeat on its day across a short month", () => {
    const monthly = every({ frequency: "monthly", anchorOn: "2026-01-31" });

    expect(completeOccurrence(monthly, "2026-01-31", "2026-02-02").dueOn).toBe("2026-02-28");
    expect(completeOccurrence(monthly, "2026-02-28", "2026-02-28").dueOn).toBe("2026-03-31");
  });

  it("advances a daily repeat by one day however long it was left", () => {
    const daily = every({ frequency: "daily", anchorOn: "2026-08-01" });
    expect(completeOccurrence(daily, "2026-08-01", "2026-08-21").dueOn).toBe("2026-08-22");
  });

  it("advances a fortnightly repeat a fortnight, not a week", () => {
    expect(completeOccurrence(every({ interval: 2 }), TUESDAY, TUESDAY).dueOn).toBe("2026-09-08");
  });
});

describe("skipOccurrence", () => {
  it("moves on without claiming anything was done", () => {
    const recurrence = every({ lastCompletedOn: "2026-08-18" });

    expect(skipOccurrence(recurrence, TUESDAY, TUESDAY)).toEqual({
      dueOn: "2026-09-01",
      lastCompletedOn: "2026-08-18",
    });
  });

  it("skips the next one when the current occurrence is still ahead", () => {
    expect(skipOccurrence(every(), "2026-09-01", TUESDAY).dueOn).toBe("2026-09-08");
  });

  it("moves an overdue repeat forward to the next one in the future", () => {
    expect(skipOccurrence(every({ anchorOn: "2026-08-04" }), "2026-08-04", TUESDAY).dueOn).toBe(
      "2026-09-01",
    );
  });
});

describe("startingOccurrence", () => {
  it("keeps a date the item already has, overdue or not", () => {
    expect(startingOccurrence("2026-08-04", TUESDAY)).toBe("2026-08-04");
    expect(startingOccurrence("2026-09-01", TUESDAY)).toBe("2026-09-01");
  });

  it("falls back to today, because a repeat with no occurrence is not a schedule", () => {
    expect(startingOccurrence(null, TUESDAY)).toBe(TUESDAY);
  });
});

describe("resolveAnchor", () => {
  it("anchors a brand new repeat to the due date", () => {
    expect(resolveAnchor(null, TUESDAY)).toBe(TUESDAY);
  });

  it("leaves the anchor alone when the due date has not moved", () => {
    // The case that matters: a monthly repeat clamped to the 28th must not
    // become "the 28th" just because the editor was saved.
    const existing = { anchorOn: "2026-01-31", dueOn: "2026-02-28" };
    expect(resolveAnchor(existing, "2026-02-28")).toBe("2026-01-31");
  });

  it("re-anchors when the due date is deliberately changed", () => {
    const existing = { anchorOn: "2026-01-31", dueOn: "2026-02-28" };
    expect(resolveAnchor(existing, "2026-03-05")).toBe("2026-03-05");
  });

  it("anchors to the due date when the item had none before", () => {
    expect(resolveAnchor({ anchorOn: "2026-01-31", dueOn: null }, TUESDAY)).toBe(TUESDAY);
  });
});
