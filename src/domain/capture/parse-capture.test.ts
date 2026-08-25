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

  describe("determinism", () => {
    it("returns the same result for the same input and context", () => {
      const text = "order the worktop @kitchen #home next friday";
      expect(parse(text)).toEqual(parse(text));
    });
  });
});
