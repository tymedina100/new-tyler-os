import { describe, expect, it } from "vitest";
import { parseSuggestion } from "./suggestion-schema";

/**
 * These are the failure modes of the one input TylerOS does not control. Each
 * of them must produce `null` — no suggestion — rather than an exception, and
 * every one of them is a real thing a language model does.
 */
describe("parseSuggestion", () => {
  it("reads a well-formed response", () => {
    expect(parseSuggestion('{"kind":"task","project":"Home","tags":["maintenance"]}')).toEqual({
      kind: "task",
      project: "Home",
      tags: ["maintenance"],
    });
  });

  it("survives the fenced code block models add unprompted", () => {
    const raw = '```json\n{"kind":"task","project":null,"tags":[]}\n```';

    expect(parseSuggestion(raw)).toEqual({ kind: "task", project: null, tags: [] });
  });

  it("survives an unlabelled fence", () => {
    expect(parseSuggestion('```\n{"kind":"note","project":null,"tags":[]}\n```')).toEqual({
      kind: "note",
      project: null,
      tags: [],
    });
  });

  it("treats missing fields as unanswered rather than invalid", () => {
    // Answering two of three questions is still useful.
    expect(parseSuggestion('{"kind":"task"}')).toEqual({ kind: "task", project: null, tags: [] });
  });

  it("treats empty and whitespace-only values as unanswered", () => {
    expect(parseSuggestion('{"kind":"","project":"   ","tags":[]}')).toEqual({
      kind: null,
      project: null,
      tags: [],
    });
  });

  it("trims what it keeps", () => {
    expect(parseSuggestion('{"kind":"  task  ","project":" Home "}')).toEqual({
      kind: "task",
      project: "Home",
      tags: [],
    });
  });

  it("costs only the tags when only the tags are malformed", () => {
    expect(parseSuggestion('{"kind":"task","project":"Home","tags":"maintenance"}')).toEqual({
      kind: "task",
      project: "Home",
      tags: [],
    });
  });

  it("drops a tag list longer than any item could hold", () => {
    const tags = JSON.stringify(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);

    expect(parseSuggestion(`{"kind":null,"project":null,"tags":${tags}}`)?.tags).toEqual([]);
  });

  it.each([
    ["prose instead of JSON", "Sure! I think this is a task."],
    ["a truncated object", '{"kind":"task","project":'],
    ["an array", '["task"]'],
    ["a bare string", '"task"'],
    ["a number", "42"],
    ["null", "null"],
    ["nothing at all", ""],
    ["only whitespace", "   \n  "],
    ["a wrongly typed field", '{"kind":{"value":"task"}}'],
    ["a numeric kind", '{"kind":123}'],
  ])("returns no suggestion for %s", (_label, raw) => {
    expect(parseSuggestion(raw)).toBeNull();
  });

  it("refuses a value long enough to be an injection attempt rather than a name", () => {
    const long = "x".repeat(500);

    expect(parseSuggestion(`{"kind":"${long}"}`)).toBeNull();
  });

  it("ignores fields it was never asked for", () => {
    // A model volunteering a due date or a recurrence must not be able to reach
    // anything: those fields are not in the schema, so they are not in the
    // parsed result and nothing downstream can read them.
    const raw = '{"kind":"task","dueOn":"2026-01-01","recurrence":"weekly","status":"done"}';
    const parsed = parseSuggestion(raw);

    expect(parsed).toEqual({ kind: "task", project: null, tags: [] });
    expect(parsed).not.toHaveProperty("dueOn");
    expect(parsed).not.toHaveProperty("recurrence");
    expect(parsed).not.toHaveProperty("status");
  });
});
