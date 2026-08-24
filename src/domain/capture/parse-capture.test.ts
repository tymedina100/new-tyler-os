import { describe, expect, it } from "vitest";
import { parseCaptureText } from "./parse-capture";

describe("parseCaptureText", () => {
  it("keeps plain text untouched", () => {
    expect(parseCaptureText("  buy paper towels  ")).toEqual({
      title: "buy paper towels",
      tags: [],
    });
  });

  it("pulls inline tags out of the title", () => {
    expect(parseCaptureText("buy paper towels #home #errand")).toEqual({
      title: "buy paper towels",
      tags: ["home", "errand"],
    });
  });

  it("handles tags written mid-sentence", () => {
    expect(parseCaptureText("research #furniture standing desks")).toEqual({
      title: "research standing desks",
      tags: ["furniture"],
    });
  });

  it("normalises and de-duplicates tags", () => {
    expect(parseCaptureText("pay bill #Home #home #HOME").tags).toEqual(["home"]);
  });

  it("ignores a hash that is not starting a word", () => {
    const parsed = parseCaptureText("read example.com/page#section");
    expect(parsed.tags).toEqual([]);
    expect(parsed.title).toBe("read example.com/page#section");
  });

  it("keeps the raw text when only tags were captured", () => {
    expect(parseCaptureText("#groceries")).toEqual({
      title: "#groceries",
      tags: ["groceries"],
    });
  });

  it("collapses the whitespace left behind by stripped tags", () => {
    expect(parseCaptureText("watch #media Severance #tv tonight").title).toBe(
      "watch Severance tonight",
    );
  });
});
