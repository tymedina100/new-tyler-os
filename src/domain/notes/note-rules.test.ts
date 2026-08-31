import { describe, expect, it } from "vitest";
import { MAX_NOTE_TITLE_LENGTH, type Note } from "@/domain/notes/note";
import { buildNoteExcerpt, compareNotesForDisplay, deriveNoteTitle } from "./note-rules";

describe("deriveNoteTitle", () => {
  it("keeps an explicit title, even when the body starts differently", () => {
    expect(deriveNoteTitle("Mazda6 maintenance", "tire pressure is 35 psi")).toBe(
      "Mazda6 maintenance",
    );
  });

  it("falls back to the first non-blank line of the body", () => {
    expect(deriveNoteTitle(null, "Mazda6 maintenance\ntire pressure is 35 psi")).toBe(
      "Mazda6 maintenance",
    );
  });

  it("skips leading blank lines to find the first real one", () => {
    expect(deriveNoteTitle(null, "\n   \nApartment measurements\nkitchen: 10x12")).toBe(
      "Apartment measurements",
    );
  });

  it("treats a whitespace-only title as no title", () => {
    expect(deriveNoteTitle("   ", "Interview notes")).toBe("Interview notes");
  });

  it("falls back to a fixed placeholder when neither is given", () => {
    expect(deriveNoteTitle(null, "")).toBe("Untitled note");
    expect(deriveNoteTitle(null, "   \n\n  ")).toBe("Untitled note");
    expect(deriveNoteTitle("", "")).toBe("Untitled note");
  });

  it("truncates a title derived from an overlong first line", () => {
    const line = "x".repeat(MAX_NOTE_TITLE_LENGTH + 50);
    const title = deriveNoteTitle(null, line);

    expect(title.length).toBe(MAX_NOTE_TITLE_LENGTH);
    expect(title.endsWith("…")).toBe(true);
  });

  it("truncates an overlong explicit title the same way", () => {
    const title = deriveNoteTitle("y".repeat(MAX_NOTE_TITLE_LENGTH + 50), "");
    expect(title.length).toBe(MAX_NOTE_TITLE_LENGTH);
  });
});

describe("buildNoteExcerpt", () => {
  it("collapses newlines and repeated whitespace into single spaces", () => {
    expect(buildNoteExcerpt("Mazda6\n\ntire pressure   is 35 psi")).toBe(
      "Mazda6 tire pressure is 35 psi",
    );
  });

  it("returns null for an empty or whitespace-only body", () => {
    expect(buildNoteExcerpt("")).toBeNull();
    expect(buildNoteExcerpt("   \n\t  ")).toBeNull();
  });

  it("truncates at the given length with an ellipsis", () => {
    const excerpt = buildNoteExcerpt("a".repeat(200), 20);
    expect(excerpt).toBe(`${"a".repeat(19)}…`);
  });

  it("leaves a short body exactly as it reads", () => {
    expect(buildNoteExcerpt("Short and sweet.")).toBe("Short and sweet.");
  });
});

describe("compareNotesForDisplay", () => {
  function note(overrides: Partial<Note>): Note {
    return {
      id: "00000000-0000-4000-8000-000000000000",
      title: "Note",
      body: "",
      pinned: false,
      projectId: null,
      createdAt: new Date(2026, 7, 1),
      updatedAt: new Date(2026, 7, 1),
      ...overrides,
    };
  }

  it("puts a pinned note ahead of an unpinned one, regardless of recency", () => {
    const pinned = note({ id: "a", pinned: true, updatedAt: new Date(2026, 0, 1) });
    const recent = note({ id: "b", pinned: false, updatedAt: new Date(2026, 7, 20) });

    expect([recent, pinned].sort(compareNotesForDisplay)).toEqual([pinned, recent]);
  });

  it("orders two notes of the same pin state by most recently updated first", () => {
    const older = note({ id: "a", updatedAt: new Date(2026, 7, 1) });
    const newer = note({ id: "b", updatedAt: new Date(2026, 7, 20) });

    expect([older, newer].sort(compareNotesForDisplay)).toEqual([newer, older]);
  });

  it("breaks an exact tie on id, for a total and deterministic order", () => {
    const same = new Date(2026, 7, 1);
    const a = note({ id: "aaaa", updatedAt: same });
    const b = note({ id: "bbbb", updatedAt: same });

    expect([b, a].sort(compareNotesForDisplay)).toEqual([a, b]);
  });
});
