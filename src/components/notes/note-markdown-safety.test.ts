import { defaultUrlTransform } from "react-markdown";
import { describe, expect, it } from "vitest";

/**
 * Pins down the one piece of `react-markdown`'s behaviour `NoteMarkdown`
 * relies on for link/image safety: `defaultUrlTransform`, applied to every
 * `href`/`src` it renders. This is a small, deliberate exception to "no
 * component tests" (`.claude/rules/testing.md`) — it asserts nothing about
 * rendering or the DOM, only that the library function this codebase's
 * safety story depends on actually behaves the way ADR 034 says it does,
 * rather than trusting a changelog. Co-located next to the component, not
 * under `src/domain/`, because importing `react-markdown` there would trip
 * the domain layer's "no react" lint rule for no benefit — this is testing
 * the library, not a TylerOS rule.
 */
describe("defaultUrlTransform (react-markdown)", () => {
  it("neutralises javascript: URLs", () => {
    expect(defaultUrlTransform("javascript:alert(1)")).toBe("");
    expect(defaultUrlTransform("JavaScript:alert(1)")).toBe("");
  });

  it("neutralises data: URLs", () => {
    expect(defaultUrlTransform("data:text/html,<script>alert(1)</script>")).toBe("");
  });

  it("neutralises vbscript: URLs", () => {
    expect(defaultUrlTransform("vbscript:msgbox(1)")).toBe("");
  });

  it("leaves ordinary http(s), mailto and relative URLs alone", () => {
    expect(defaultUrlTransform("https://example.com")).toBe("https://example.com");
    expect(defaultUrlTransform("http://example.com")).toBe("http://example.com");
    expect(defaultUrlTransform("mailto:tyler@example.com")).toBe("mailto:tyler@example.com");
    expect(defaultUrlTransform("/notes/some-id")).toBe("/notes/some-id");
    expect(defaultUrlTransform("#heading")).toBe("#heading");
  });
});
