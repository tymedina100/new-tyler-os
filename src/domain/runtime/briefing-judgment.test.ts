import { describe, expect, it } from "vitest";
import { parseMilesJudgment, renderMilesBriefing } from "./briefing-judgment";

describe("parseMilesJudgment", () => {
  it("accepts a bounded structured object", () => {
    const parsed = parseMilesJudgment(
      JSON.stringify({
        summary: "Pay rent is overdue.",
        priorities: ["Pay rent"],
        needsTyler: ["Decide whether to call the plumber."],
        watch: ["Milk expires tomorrow."],
      }),
    );
    expect(parsed?.summary).toBe("Pay rent is overdue.");
    expect(parsed?.priorities).toEqual(["Pay rent"]);
  });

  it("rejects markdown and missing fields", () => {
    expect(parseMilesJudgment("## Overdue\n- Pay rent")).toBeNull();
    expect(parseMilesJudgment(JSON.stringify({ summary: "Hi" }))).toBeNull();
  });

  it("rejects over-long arrays instead of silently truncating", () => {
    expect(
      parseMilesJudgment(
        JSON.stringify({
          summary: "Too many.",
          priorities: ["a", "b", "c", "d", "e", "f"],
          needsTyler: [],
          watch: [],
        }),
      ),
    ).toBeNull();
  });
});

describe("renderMilesBriefing", () => {
  it("turns validated judgment into a note proposal", () => {
    const rendered = renderMilesBriefing("2026-09-05", {
      summary: "Pay rent is overdue.",
      priorities: ["Pay rent"],
      needsTyler: [],
      watch: ["Milk"],
    });
    expect(rendered.title).toBe("Today briefing — 5 Sep 2026");
    expect(rendered.body).toContain("## Priorities");
    expect(rendered.body).toContain("- Pay rent");
    expect(rendered.body).toContain("## Watch");
  });
});
