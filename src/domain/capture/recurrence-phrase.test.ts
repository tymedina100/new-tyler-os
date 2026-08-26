import { describe, expect, it } from "vitest";
import { MAX_RECURRENCE_INTERVAL } from "@/domain/recurrence/recurrence";
import { matchTrailingRecurrencePhrase } from "./recurrence-phrase";

/**
 * Fixed reference dates throughout. A test that resolves "every tuesday" by
 * calling the clock passes today and fails in November.
 *
 * 2026-08-25 is a Tuesday, so the weekday arithmetic below reads plainly.
 */
const TUESDAY = "2026-08-25";

function match(text: string, today = TUESDAY) {
  return matchTrailingRecurrencePhrase(text, today);
}

/** The compact shape the table cases assert on. */
function parsed(text: string, today = TUESDAY) {
  const found = match(text, today);
  if (found === null) return null;
  return {
    frequency: found.rule.frequency,
    interval: found.rule.interval,
    anchorOn: found.anchorOn,
    rest: found.rest,
  };
}

describe("matchTrailingRecurrencePhrase", () => {
  describe("one word", () => {
    const cases: [string, string, number][] = [
      ["water plants daily", "daily", 1],
      ["review budget weekly", "weekly", 1],
      ["pay rent monthly", "monthly", 1],
      ["wash sheets fortnightly", "weekly", 2],
    ];

    for (const [text, frequency, interval] of cases) {
      it(`reads "${text}"`, () => {
        expect(parsed(text)).toMatchObject({ frequency, interval, anchorOn: null });
      });
    }
  });

  describe("every <period>", () => {
    const cases: [string, string, number][] = [
      ["medication every day", "daily", 1],
      ["standup every week", "weekly", 1],
      ["pay rent every month", "monthly", 1],
    ];

    for (const [text, frequency, interval] of cases) {
      it(`reads "${text}"`, () => {
        expect(parsed(text)).toMatchObject({ frequency, interval, anchorOn: null });
      });
    }
  });

  describe("every N <period>", () => {
    const cases: [string, string, number][] = [
      ["clean bathroom every 2 weeks", "weekly", 2],
      ["change air filter every 3 months", "monthly", 3],
      ["check smoke detector every 6 months", "monthly", 6],
      ["stretch every 2 days", "daily", 2],
      // An interval of one is legitimate, and means the same as the bare word.
      ["bins every 1 week", "weekly", 1],
      // Singular and plural both, because both get typed.
      ["report every 2 week", "weekly", 2],
      [`audit every ${MAX_RECURRENCE_INTERVAL} months`, "monthly", MAX_RECURRENCE_INTERVAL],
    ];

    for (const [text, frequency, interval] of cases) {
      it(`reads "${text}"`, () => {
        expect(parsed(text)).toMatchObject({ frequency, interval, anchorOn: null });
      });
    }
  });

  describe("every other <period>", () => {
    const cases: [string, string, number][] = [
      ["wash sheets every other week", "weekly", 2],
      ["deep clean every other month", "monthly", 2],
      ["water the ferns every other day", "daily", 2],
    ];

    for (const [text, frequency, interval] of cases) {
      it(`reads "${text}"`, () => {
        expect(parsed(text)).toMatchObject({ frequency, interval, anchorOn: null });
      });
    }
  });

  describe("every <weekday>", () => {
    it("anchors on the coming instance of that day", () => {
      // Wednesday from a Tuesday is tomorrow.
      expect(parsed("swimming every wednesday")).toMatchObject({
        frequency: "weekly",
        interval: 1,
        anchorOn: "2026-08-26",
        rest: "swimming",
      });
    });

    it("counts today as the coming instance, matching a bare weekday", () => {
      // Saying "every tuesday" on a Tuesday means today, not a week away — the
      // same rule `matchTrailingDatePhrase` applies to a bare "tuesday".
      expect(parsed("take trash out every tuesday")).toMatchObject({ anchorOn: TUESDAY });
    });

    it("wraps into next week for a day already gone", () => {
      // Monday, from a Tuesday, is six days off.
      expect(parsed("laundry every monday")).toMatchObject({ anchorOn: "2026-08-31" });
    });

    it("accepts the short forms people actually type", () => {
      expect(parsed("bins every tue")).toMatchObject({ anchorOn: TUESDAY });
      expect(parsed("gym every sat")).toMatchObject({ anchorOn: "2026-08-29" });
    });
  });

  describe("the title it leaves behind", () => {
    it("returns everything before the phrase", () => {
      expect(parsed("take the trash out every tuesday")?.rest).toBe("take the trash out");
      expect(parsed("change air filter every 3 months")?.rest).toBe("change air filter");
    });

    it("can leave nothing, which the caller has to handle", () => {
      // `parseCapture` refuses to strip in this case. The matcher itself just
      // reports what it found.
      expect(parsed("daily")?.rest).toBe("");
    });

    it("ignores trailing punctuation", () => {
      expect(parsed("water plants daily.")).toMatchObject({ frequency: "daily", interval: 1 });
      expect(parsed("bins every tuesday!")).toMatchObject({ anchorOn: TUESDAY });
    });

    it("is case insensitive, because sentences start with a capital", () => {
      expect(parsed("Water plants Daily")).toMatchObject({ frequency: "daily" });
      expect(parsed("bins Every Other Week")).toMatchObject({ frequency: "weekly", interval: 2 });
    });
  });

  describe("what it refuses to guess at", () => {
    const rejected = [
      // The words are present but not at the end. This one rule removes most
      // false positives, and it is why a book title survives.
      "read Every Day by David Levithan",
      "daily standup notes",
      "write the weekly report",
      "monthly accounts spreadsheet",
      "every tuesday is bin day",
      // Prose that looks like a schedule but is not in the grammar.
      "pay the invoice first business day",
      "bins last friday of the month",
      "gym weekdays only",
      "swim twice a week",
      "review three times per month",
      "harvest every full moon",
      "call mum every so often",
      "backup every now and then",
      // Deliberately excluded: "biweekly" means both twice a week and every two
      // weeks depending on who says it, so it stays as text.
      "sync biweekly",
      // Frequencies the domain has no representation for.
      "renew licence yearly",
      "taxes annually",
      "review quarterly",
    ];

    for (const text of rejected) {
      it(`leaves "${text}" alone`, () => {
        expect(match(text)).toBeNull();
      });
    }
  });

  describe("intervals it will not accept", () => {
    const rejected = [
      // Zero and negatives are not schedules. Negative never even tokenises as
      // digits, but it is asserted so a future regex change cannot let it in.
      "stretch every 0 days",
      "stretch every 0 weeks",
      "stretch every -1 weeks",
      // Above what the domain allows. Refused rather than clamped: clamping
      // would invent a schedule nobody asked for.
      `audit every ${MAX_RECURRENCE_INTERVAL + 1} months`,
      "audit every 500 days",
      "audit every 1000 days",
      // Not whole numbers.
      "stretch every 2.5 weeks",
      "stretch every half week",
      "stretch every two weeks",
    ];

    for (const text of rejected) {
      it(`leaves "${text}" alone`, () => {
        expect(match(text)).toBeNull();
      });
    }
  });

  describe("edges", () => {
    it("handles an empty and a one-word input", () => {
      expect(match("")).toBeNull();
      expect(match("   ")).toBeNull();
      expect(parsed("monthly")).toMatchObject({ frequency: "monthly", rest: "" });
    });

    it("takes the longest phrase, so a count is never read as a bare period", () => {
      // "every 2 weeks" must not degrade into "weeks" or "every week".
      expect(parsed("report every 2 weeks")).toMatchObject({ interval: 2 });
      expect(parsed("report every other week")).toMatchObject({ interval: 2 });
    });

    it("needs the word every before a period or a weekday", () => {
      expect(match("report 2 weeks")).toBeNull();
      expect(match("report tuesday")).toBeNull();
      expect(match("report other week")).toBeNull();
    });

    it("resolves a weekday against the reference date it is given", () => {
      // The same text, three different reference dates, three answers — and no
      // ambient clock anywhere.
      expect(parsed("bins every friday", "2026-08-25")?.anchorOn).toBe("2026-08-28");
      expect(parsed("bins every friday", "2026-08-28")?.anchorOn).toBe("2026-08-28");
      expect(parsed("bins every friday", "2026-08-29")?.anchorOn).toBe("2026-09-04");
    });

    it("crosses a month and a year boundary when resolving a weekday", () => {
      // Monday 2026-12-28 → the coming Friday is 2027-01-01.
      expect(parsed("bins every friday", "2026-12-28")?.anchorOn).toBe("2027-01-01");
    });
  });
});
