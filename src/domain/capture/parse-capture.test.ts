import { describe, expect, it } from "vitest";
import { type CaptureContext, parseCapture } from "./parse-capture";
import type { ProjectRef } from "@/domain/projects/project";

const PROJECTS: ProjectRef[] = [
  { id: "p-kitchen", name: "Kitchen Refresh" },
  { id: "p-tyleros", name: "TylerOS" },
  { id: "p-media", name: "Media" },
];

/** Tuesday. Fixed, so weekday arithmetic in these tests never drifts. */
const TUESDAY = "2026-08-25";

const context: CaptureContext = { today: TUESDAY, projects: PROJECTS };

function parse(raw: string, overrides: Partial<CaptureContext> = {}) {
  return parseCapture(raw, { ...context, ...overrides });
}

describe("parseCapture", () => {
  describe("title only", () => {
    it("keeps plain text untouched", () => {
      expect(parse("  buy paper towels  ")).toEqual({
        title: "buy paper towels",
        tags: [],
        dueOn: null,
        projectId: null,
        unresolvedProject: null,
        recurrence: null,
      });
    });
  });

  describe("tags only", () => {
    it("pulls inline tags out of the title", () => {
      expect(parse("buy paper towels #home #errand")).toMatchObject({
        title: "buy paper towels",
        tags: ["home", "errand"],
      });
    });

    it("handles tags written mid-sentence", () => {
      expect(parse("research #furniture standing desks")).toMatchObject({
        title: "research standing desks",
        tags: ["furniture"],
      });
    });

    it("normalises and de-duplicates tags", () => {
      expect(parse("pay bill #Home #home #HOME").tags).toEqual(["home"]);
    });

    it("ignores a hash that is not starting a word", () => {
      const parsed = parse("read example.com/page#section");
      expect(parsed.tags).toEqual([]);
      expect(parsed.title).toBe("read example.com/page#section");
    });

    it("keeps the raw text when only tags were captured", () => {
      expect(parse("#groceries")).toMatchObject({ title: "#groceries", tags: ["groceries"] });
    });

    it("collapses the whitespace left behind by stripped tags", () => {
      expect(parse("watch #media Severance #tv tonight").title).toBe("watch Severance");
    });
  });

  describe("date only", () => {
    it("reads a trailing date and cleans the title", () => {
      expect(parse("pay electric bill friday")).toMatchObject({
        title: "pay electric bill",
        dueOn: "2026-08-28",
      });
    });

    it("reads tomorrow", () => {
      expect(parse("call apartment tomorrow")).toMatchObject({
        title: "call apartment",
        dueOn: "2026-08-26",
      });
    });

    it("leaves a date-shaped word alone when it is the whole capture", () => {
      // An item called "tomorrow" due tomorrow helps nobody.
      expect(parse("tomorrow")).toMatchObject({ title: "tomorrow", dueOn: null });
    });

    it("does not read a date from the middle of a title", () => {
      expect(parse("monday meeting notes")).toMatchObject({
        title: "monday meeting notes",
        dueOn: null,
      });
    });
  });

  describe("project only", () => {
    it("assigns a project from an inline reference", () => {
      expect(parse("finish database migration @TylerOS")).toMatchObject({
        title: "finish database migration",
        projectId: "p-tyleros",
        unresolvedProject: null,
      });
    });

    it("matches a multi-word project name written without spaces", () => {
      expect(parse("order worktop samples @kitchenrefresh")).toMatchObject({
        title: "order worktop samples",
        projectId: "p-kitchen",
      });
    });

    it("accepts a reference written mid-sentence", () => {
      expect(parse("finish @TylerOS parser tests")).toMatchObject({
        title: "finish parser tests",
        projectId: "p-tyleros",
      });
    });

    it("keeps an unknown reference in the title and assigns nothing", () => {
      expect(parse("plant the bulbs @Gardening")).toEqual({
        title: "plant the bulbs @Gardening",
        tags: [],
        dueOn: null,
        projectId: null,
        unresolvedProject: { ref: "Gardening", reason: "unknown" },
        recurrence: null,
      });
    });

    it("keeps an ambiguous reference in the title and assigns nothing", () => {
      const projects: ProjectRef[] = [
        { id: "a", name: "Money" },
        { id: "b", name: "Moving House" },
      ];
      expect(parse("sort the paperwork @mo", { projects })).toMatchObject({
        title: "sort the paperwork @mo",
        projectId: null,
        unresolvedProject: { ref: "mo", reason: "ambiguous" },
      });
    });

    it("leaves an email address alone", () => {
      expect(parse("email tyler@example.com about the quote")).toEqual({
        title: "email tyler@example.com about the quote",
        tags: [],
        dueOn: null,
        projectId: null,
        unresolvedProject: null,
        recurrence: null,
      });
    });

    it("uses only the first reference and leaves any second one as text", () => {
      expect(parse("compare @TylerOS and @Media")).toMatchObject({
        title: "compare and @Media",
        projectId: "p-tyleros",
      });
    });

    it("ignores a bare @ with nothing after it", () => {
      expect(parse("meet @ the cafe")).toMatchObject({
        title: "meet @ the cafe",
        projectId: null,
        unresolvedProject: null,
      });
    });
  });

  describe("combinations", () => {
    it("reads a date and a tag together", () => {
      expect(parse("pay bill friday #finance")).toMatchObject({
        title: "pay bill",
        tags: ["finance"],
        dueOn: "2026-08-28",
      });
    });

    it("does not care whether the tag comes before or after the date", () => {
      const before = parse("pay bill #finance friday");
      const after = parse("pay bill friday #finance");
      expect(before).toEqual(after);
    });

    it("reads a date and a project together", () => {
      expect(parse("ship the parser @TylerOS tomorrow")).toMatchObject({
        title: "ship the parser",
        projectId: "p-tyleros",
        dueOn: "2026-08-26",
      });
    });

    it("reads a project and a tag together", () => {
      expect(parse("watch Severance @Media #tv")).toMatchObject({
        title: "watch Severance",
        projectId: "p-media",
        tags: ["tv"],
      });
    });

    it("reads a date, a project and several tags at once", () => {
      expect(parse("order the worktop @kitchen #home #urgent next friday")).toEqual({
        title: "order the worktop",
        tags: ["home", "urgent"],
        dueOn: "2026-09-04",
        projectId: "p-kitchen",
        unresolvedProject: null,
        recurrence: null,
      });
    });

    it("is order-independent across all three token kinds", () => {
      const orders = [
        "order the worktop @kitchen #home next friday",
        "order the worktop #home @kitchen next friday",
        "@kitchen order the worktop #home next friday",
        "#home @kitchen order the worktop next friday",
      ].map((text) => parse(text));

      for (const parsed of orders) {
        expect(parsed).toEqual(orders[0]);
      }
    });

    it("handles the roadmap's own examples", () => {
      expect(parse("pay electric bill friday")).toMatchObject({
        title: "pay electric bill",
        dueOn: "2026-08-28",
      });
      expect(parse("buy paper towels #home")).toMatchObject({
        title: "buy paper towels",
        tags: ["home"],
      });
      expect(parse("finish database migration @TylerOS")).toMatchObject({
        title: "finish database migration",
        projectId: "p-tyleros",
      });
      expect(parse("research monitor arms this weekend #desk")).toMatchObject({
        title: "research monitor arms",
        dueOn: "2026-08-29",
        tags: ["desk"],
      });
      expect(parse("watch Severance @Media")).toMatchObject({
        title: "watch Severance",
        projectId: "p-media",
      });
    });
  });

  describe("malformed and ambiguous input", () => {
    it.each(["###", "@@@", "#", "@", "# #", "-- --"])("never loses the text of %j", (text) => {
      expect(parse(text).title.length).toBeGreaterThan(0);
    });

    it("keeps a hash that carries no usable tag name", () => {
      expect(parse("track issue #123!!").tags).toEqual(["123"]);
    });

    it("survives an empty capture without throwing", () => {
      expect(parse("")).toMatchObject({ title: "", tags: [], dueOn: null, projectId: null });
    });

    it("is unaffected by having no projects to match against", () => {
      expect(parse("finish the parser @TylerOS", { projects: [] })).toMatchObject({
        title: "finish the parser @TylerOS",
        unresolvedProject: { ref: "TylerOS", reason: "unknown" },
      });
    });
  });

  describe("recurrence", () => {
    it("reads a repeat and leaves the responsibility as the title", () => {
      expect(parse("take trash out every tuesday")).toEqual({
        title: "take trash out",
        tags: [],
        // The coming Tuesday, which on a Tuesday is today.
        dueOn: TUESDAY,
        projectId: null,
        unresolvedProject: null,
        recurrence: { frequency: "weekly", interval: 1 },
      });
    });

    it("always gives a repeat a first occurrence to sit on", () => {
      // The invariant the editor holds too: a schedule with no current
      // occurrence is not a schedule. Undated repeats start today.
      for (const text of [
        "water plants daily",
        "review budget weekly",
        "pay rent monthly",
        "clean bathroom every 2 weeks",
        "wash sheets every other week",
      ]) {
        const result = parse(text);
        expect(result.recurrence).not.toBeNull();
        expect(result.dueOn).toBe(TUESDAY);
      }
    });

    describe("with the rest of the capture", () => {
      it("combines with a tag", () => {
        expect(parse("clean bathroom every 2 weeks #home")).toMatchObject({
          title: "clean bathroom",
          tags: ["home"],
          dueOn: TUESDAY,
          recurrence: { frequency: "weekly", interval: 2 },
        });
      });

      it("combines with a project", () => {
        expect(parse("check smoke detector every 6 months @TylerOS")).toMatchObject({
          title: "check smoke detector",
          projectId: "p-tyleros",
          recurrence: { frequency: "monthly", interval: 6 },
        });
      });

      it("combines with a project and a tag", () => {
        expect(parse("order filters monthly @kitchen #home")).toMatchObject({
          title: "order filters",
          projectId: "p-kitchen",
          tags: ["home"],
          recurrence: { frequency: "monthly", interval: 1 },
        });
      });

      it("takes a stated date as the anchor, after the repeat", () => {
        expect(parse("report every 2 weeks friday")).toMatchObject({
          title: "report",
          dueOn: "2026-08-28",
          recurrence: { frequency: "weekly", interval: 2 },
        });
      });

      it("takes a stated date as the anchor, before the repeat", () => {
        expect(parse("clean fridge tomorrow every month")).toMatchObject({
          title: "clean fridge",
          dueOn: "2026-08-26",
          recurrence: { frequency: "monthly", interval: 1 },
        });
      });

      it("reads a spelled-out date through a preposition", () => {
        expect(parse("pay rent monthly on september 1")).toMatchObject({
          title: "pay rent",
          dueOn: "2026-09-01",
          recurrence: { frequency: "monthly", interval: 1 },
        });
      });

      it("combines with a date and a tag", () => {
        // A stated date is the anchor even when the repeat named a different
        // day, so this reads as "weekly bins, starting next Friday". The input
        // contradicts itself; what matters is that it resolves one way every
        // time, and that the preview says which.
        expect(parse("bins every tuesday next friday #home")).toMatchObject({
          title: "bins",
          tags: ["home"],
          dueOn: "2026-09-04",
          recurrence: { frequency: "weekly", interval: 1 },
        });
      });

      it("combines a repeat, a date, a project and a tag", () => {
        expect(parse("deep clean every 3 months friday @kitchen #home")).toEqual({
          title: "deep clean",
          tags: ["home"],
          dueOn: "2026-08-28",
          projectId: "p-kitchen",
          unresolvedProject: null,
          recurrence: { frequency: "monthly", interval: 3 },
        });
      });

      it("an explicit date wins over the day a weekday repeat named", () => {
        // Odd input, but it must resolve one way and stay that way.
        expect(parse("bins every tuesday tomorrow")).toMatchObject({
          dueOn: "2026-08-26",
          recurrence: { frequency: "weekly", interval: 1 },
        });
      });

      it("keeps the repeat when the project cannot be resolved", () => {
        // Losing the whole capture because one reference was wrong is the one
        // outcome this parser must never produce.
        expect(parse("clean gutters every 6 months @Nonsense")).toMatchObject({
          title: "clean gutters every 6 months @Nonsense",
          projectId: null,
          unresolvedProject: { ref: "Nonsense", reason: "unknown" },
          recurrence: null,
        });
      });

      it("reads the repeat once an ambiguous reference is out of the way", () => {
        const projects: ProjectRef[] = [
          { id: "a", name: "Money" },
          { id: "b", name: "Monitors" },
        ];
        expect(parse("review budget weekly @Mon", { projects })).toMatchObject({
          unresolvedProject: { ref: "Mon", reason: "ambiguous" },
          recurrence: null,
        });
      });

      it("reads the repeat through a malformed tag or reference", () => {
        expect(parse("water plants daily #")).toMatchObject({
          title: "water plants daily #",
          recurrence: null,
        });
        expect(parse("water plants #! daily")).toMatchObject({
          title: "water plants #!",
          recurrence: { frequency: "daily", interval: 1 },
        });
        expect(parse("water plants @ daily")).toMatchObject({
          title: "water plants @",
          recurrence: { frequency: "daily", interval: 1 },
        });
      });
    });

    describe("what it leaves as ordinary text", () => {
      it("does not turn a book title into a habit", () => {
        expect(parse("read Every Day by David Levithan")).toMatchObject({
          title: "read Every Day by David Levithan",
          dueOn: null,
          recurrence: null,
        });
      });

      const untouched = [
        "daily standup notes",
        "write the weekly report",
        "monthly accounts spreadsheet",
        "every tuesday is bin day",
        "the day after the week of the month",
        "swim twice a week",
        "review three times per month",
        "pay the invoice first business day",
        "bins last friday of the month",
        "harvest every full moon",
        "sync biweekly",
        "renew licence yearly",
      ];

      for (const text of untouched) {
        it(`keeps "${text}" whole`, () => {
          expect(parse(text)).toMatchObject({ title: text, recurrence: null });
        });
      }

      it("keeps a weekday used as a title", () => {
        // Already true of dates — ADR 018 — and it must stay true with repeats
        // in the picture.
        expect(parse("monday meeting notes")).toMatchObject({
          title: "monday meeting notes",
          dueOn: null,
          recurrence: null,
        });
      });

      it("keeps a bare repeat word as a title rather than an unnamed habit", () => {
        for (const text of ["daily", "weekly", "monthly", "fortnightly", "every 2 weeks"]) {
          expect(parse(text)).toMatchObject({ title: text, recurrence: null });
        }
      });

      it("still lets the date parser have a lone trailing weekday", () => {
        // "every tuesday" with nothing in front of it cannot become a repeat
        // without leaving an unnamed item, so the repeat is refused — and then
        // the date parser claims the Tuesday, exactly as it always has for any
        // text ending in a weekday. Pre-existing, and the ADR 018 trade-off:
        // a visible odd title beats a silent wrong schedule.
        expect(parse("every tuesday")).toMatchObject({
          title: "every",
          dueOn: TUESDAY,
          recurrence: null,
        });
      });

      it("refuses an interval the domain would not accept", () => {
        for (const text of [
          "stretch every 0 days",
          "stretch every -2 weeks",
          "audit every 100 months",
          "audit every 500 days",
          "stretch every 2.5 weeks",
          "stretch every two weeks",
        ]) {
          expect(parse(text)).toMatchObject({ title: text, recurrence: null });
        }
      });

      it("accepts an interval of exactly one", () => {
        expect(parse("bins every 1 week")).toMatchObject({
          title: "bins",
          recurrence: { frequency: "weekly", interval: 1 },
        });
      });
    });

    describe("boundaries", () => {
      it("anchors a weekday repeat across a month end", () => {
        // Monday 2026-08-31; the coming Tuesday is in September.
        expect(parse("bins every tuesday", { today: "2026-08-31" })).toMatchObject({
          dueOn: "2026-09-01",
        });
      });

      it("anchors a weekday repeat across a year end", () => {
        expect(parse("bins every friday", { today: "2026-12-28" })).toMatchObject({
          dueOn: "2027-01-01",
        });
      });

      it("starts an undated monthly repeat on a 31st when that is today", () => {
        // The anchor is simply today. What the schedule then does with a short
        // February is `occurrenceOn`'s job, and it is tested there.
        expect(parse("pay rent monthly", { today: "2026-08-31" })).toMatchObject({
          dueOn: "2026-08-31",
          recurrence: { frequency: "monthly", interval: 1 },
        });
      });

      it("starts an undated repeat on a leap day when that is today", () => {
        expect(parse("water plants every other day", { today: "2028-02-29" })).toMatchObject({
          dueOn: "2028-02-29",
          recurrence: { frequency: "daily", interval: 2 },
        });
      });
    });
  });

  describe("determinism", () => {
    it("returns the same result for the same input and context", () => {
      const text = "order the worktop @kitchen #home next friday";
      expect(parse(text)).toEqual(parse(text));
    });

    it("returns the same result for a repeat, too", () => {
      const text = "clean bathroom every 2 weeks @kitchen #home";
      expect(parse(text)).toEqual(parse(text));
    });
  });
});
