import { describe, expect, it } from "vitest";
import { matchNotePrefix } from "./note-prefix";

describe("matchNotePrefix", () => {
  it("recognises the reserved prefix and returns what follows it", () => {
    expect(matchNotePrefix("note: Mazda6 tire pressure is 35 psi")).toBe(
      "Mazda6 tire pressure is 35 psi",
    );
  });

  it("is case-insensitive", () => {
    expect(matchNotePrefix("NOTE: apartment measurements")).toBe("apartment measurements");
    expect(matchNotePrefix("Note:apartment measurements")).toBe("apartment measurements");
  });

  it("tolerates leading whitespace before the prefix", () => {
    expect(matchNotePrefix("   note: idea for the sidebar")).toBe("idea for the sidebar");
  });

  it("works with no space after the colon", () => {
    expect(matchNotePrefix("note:tire pressure is 35 psi")).toBe("tire pressure is 35 psi");
  });

  it("requires the colon to immediately follow the word note", () => {
    // "notebook:" must never be read as the note prefix followed by "book:".
    expect(matchNotePrefix("notebook: check reviews")).toBeNull();
    expect(matchNotePrefix("notedown something")).toBeNull();
  });

  it("returns null for a bare prefix with nothing after it, falling through to item capture", () => {
    expect(matchNotePrefix("note:")).toBeNull();
    expect(matchNotePrefix("note:   ")).toBeNull();
    expect(matchNotePrefix("  note:  ")).toBeNull();
  });

  it("returns null for ordinary text that never invoked the prefix", () => {
    expect(matchNotePrefix("pay the electric bill friday")).toBeNull();
    expect(matchNotePrefix("a note about the car")).toBeNull();
  });

  it("preserves the rest of the text verbatim, including its own punctuation", () => {
    expect(matchNotePrefix("note: rates: 5% down, 3.5% APR")).toBe("rates: 5% down, 3.5% APR");
  });
});
