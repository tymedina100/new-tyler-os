import { describe, expect, it } from "vitest";
import { matchTrailingDatePhrase } from "./date-phrase";

/**
 * Fixed reference dates throughout. A test that says "tomorrow" by calling the
 * clock passes today and fails in November.
 *
 * 2026-08-25 is a Tuesday. Most cases use it so the weekday arithmetic is
 * readable; the boundary cases walk a whole week deliberately.
 */
const TUESDAY = "2026-08-25";

function dueOn(text: string, today = TUESDAY): string | null {
  return matchTrailingDatePhrase(text, today)?.dueOn ?? null;
}

describe("matchTrailingDatePhrase", () => {
  describe("plain words", () => {
    const cases: [string, string][] = [
      ["pay the bill today", "2026-08-25"],
      ["pay the bill tonight", "2026-08-25"],
      ["pay the bill tomorrow", "2026-08-26"],
      ["pay the bill 2026-12-01", "2026-12-01"],
    ];

    it.each(cases)("reads %j as %s", (text, expected) => {
      expect(dueOn(text)).toBe(expected);
    });

    it("returns the text with the phrase removed", () => {
      expect(matchTrailingDatePhrase("pay the bill tomorrow", TUESDAY)).toEqual({
        dueOn: "2026-08-26",
        rest: "pay the bill",
      });
    });
  });

  describe("bare weekdays", () => {
    // From Tuesday 2026-08-25. Monday is a week away; Tuesday is today.
    const cases: [string, string][] = [
      ["monday", "2026-08-31"],
      ["tuesday", "2026-08-25"],
      ["wednesday", "2026-08-26"],
      ["thursday", "2026-08-27"],
      ["friday", "2026-08-28"],
      ["saturday", "2026-08-29"],
      ["sunday", "2026-08-30"],
    ];

    it.each(cases)("resolves %s to %s", (day, expected) => {
      expect(dueOn(`call the bank ${day}`)).toBe(expected);
    });

    it("accepts three-letter forms", () => {
      expect(dueOn("call the bank fri")).toBe("2026-08-28");
      expect(dueOn("call the bank thu")).toBe("2026-08-27");
    });

    it("treats the current weekday as today rather than a week away", () => {
      // Saying "friday" on a Friday means the one you are standing in.
      expect(dueOn("call the bank friday", "2026-08-28")).toBe("2026-08-28");
    });

    it("is the same as writing `this`", () => {
      expect(dueOn("call the bank this friday")).toBe(dueOn("call the bank friday"));
    });
  });

  describe("next <weekday>", () => {
    // "next friday" is the Friday of next week, never one in the current week.
    const cases: [string, string, string][] = [
      ["monday 2026-08-24", "2026-08-24", "2026-09-04"],
      ["tuesday 2026-08-25", "2026-08-25", "2026-09-04"],
      ["friday 2026-08-28", "2026-08-28", "2026-09-04"],
      ["saturday 2026-08-29", "2026-08-29", "2026-09-04"],
      ["sunday 2026-08-30", "2026-08-30", "2026-09-04"],
    ];

    it.each(cases)("from %s resolves next friday to %s", (_label, today, expected) => {
      expect(dueOn("call the bank next friday", today)).toBe(expected);
    });

    it("never lands in the current week", () => {
      // Monday-start weeks: every day of the week below shares one answer.
      const answers = new Set(cases.map(([, today]) => dueOn("x next friday", today)));
      expect(answers.size).toBe(1);
    });

    it("resolves next week to the coming Monday", () => {
      expect(dueOn("plan the sprint next week")).toBe("2026-08-31");
    });
  });

  describe("weekends", () => {
    it("reads this weekend as the coming Saturday", () => {
      expect(dueOn("research monitor arms this weekend")).toBe("2026-08-29");
    });

    it("treats Sunday as already being the weekend", () => {
      expect(dueOn("research monitor arms this weekend", "2026-08-30")).toBe("2026-08-30");
    });

    it("reads next weekend as the Saturday of next week", () => {
      expect(dueOn("research monitor arms next weekend")).toBe("2026-09-05");
    });
  });

  describe("relative spans", () => {
    it.each([
      ["in 3 days", "2026-08-28"],
      ["in 1 day", "2026-08-26"],
      ["in 2 weeks", "2026-09-08"],
      ["in 1 week", "2026-09-01"],
    ])("reads %j as %s", (phrase, expected) => {
      expect(dueOn(`chase the invoice ${phrase}`)).toBe(expected);
    });

    it("ignores spans it cannot count", () => {
      expect(dueOn("chase the invoice in a few days")).toBeNull();
      expect(dueOn("chase the invoice in 3 fortnights")).toBeNull();
    });
  });

  describe("calendar dates", () => {
    it.each([
      ["september 3", "2026-09-03"],
      ["sep 3", "2026-09-03"],
      ["sep 3rd", "2026-09-03"],
      ["march 14 2027", "2027-03-14"],
    ])("reads %j as %s", (phrase, expected) => {
      expect(dueOn(`book the appointment ${phrase}`)).toBe(expected);
    });

    it("rolls a passed month-day into next year", () => {
      // Typed in December, "march 14" means the March that is still ahead.
      expect(dueOn("book the appointment march 14", "2026-12-01")).toBe("2027-03-14");
    });

    it("keeps a month-day that is still ahead in the current year", () => {
      expect(dueOn("book the appointment december 24", "2026-12-01")).toBe("2026-12-24");
    });

    it("refuses dates the calendar does not have", () => {
      expect(dueOn("book the appointment february 31")).toBeNull();
    });
  });

  describe("prepositions", () => {
    it.each(["on friday", "by friday", "due friday"])(
      "ignores the leading word in %j",
      (phrase) => {
        expect(matchTrailingDatePhrase(`pay the bill ${phrase}`, TUESDAY)).toEqual({
          dueOn: "2026-08-28",
          rest: "pay the bill",
        });
      },
    );
  });

  describe("what it deliberately leaves alone", () => {
    it("only reads a date at the end", () => {
      // A note about Monday's meeting is not something due on Monday.
      expect(dueOn("monday meeting notes")).toBeNull();
      expect(dueOn("friday deploy checklist")).toBeNull();
    });

    it("ignores a date phrase followed by other words", () => {
      expect(dueOn("pay the bill friday morning")).toBeNull();
    });

    it("returns null for text with no date at all", () => {
      expect(dueOn("buy paper towels")).toBeNull();
      expect(dueOn("")).toBeNull();
    });

    it("does not read a bare month name as a date", () => {
      expect(dueOn("this may work")).toBeNull();
      expect(dueOn("read the march report")).toBeNull();
    });

    it("tolerates trailing punctuation", () => {
      expect(dueOn("pay the bill friday.")).toBe("2026-08-28");
    });
  });

  describe("determinism", () => {
    it("gives the same answer for the same input and reference date", () => {
      const first = matchTrailingDatePhrase("pay the bill next friday", TUESDAY);
      const second = matchTrailingDatePhrase("pay the bill next friday", TUESDAY);
      expect(first).toEqual(second);
    });

    it("crosses a month boundary without drifting", () => {
      expect(dueOn("pay the bill friday", "2026-08-31")).toBe("2026-09-04");
    });

    it("crosses a year boundary without drifting", () => {
      expect(dueOn("pay the bill friday", "2026-12-31")).toBe("2027-01-01");
    });

    it("handles a leap day", () => {
      expect(dueOn("pay the bill tomorrow", "2028-02-28")).toBe("2028-02-29");
    });
  });
});
