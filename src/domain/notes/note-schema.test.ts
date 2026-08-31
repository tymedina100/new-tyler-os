import { describe, expect, it } from "vitest";
import {
  captureNoteSchema,
  noteFieldsSchema,
  setNotePinnedSchema,
  updateNoteSchema,
} from "./note-schema";

const VALID_ID = "b1f0d0b6-2c9d-4f9c-9b2a-0f0a1c2d3e4f";

describe("captureNoteSchema", () => {
  it("accepts a plain body", () => {
    const result = captureNoteSchema.parse({ body: "Mazda6 tire pressure is 35 psi" });
    expect(result.body).toBe("Mazda6 tire pressure is 35 psi");
  });

  it("rejects an empty or whitespace-only capture", () => {
    expect(captureNoteSchema.safeParse({ body: "" }).success).toBe(false);
    expect(captureNoteSchema.safeParse({ body: "   " }).success).toBe(false);
  });
});

describe("noteFieldsSchema", () => {
  const base = { title: "", body: "some content", tags: "", projectId: "" };

  it("turns a blank title into null rather than an empty string", () => {
    expect(noteFieldsSchema.parse(base).title).toBeNull();
  });

  it("treats the sentinel project value as no project, like items do", () => {
    expect(noteFieldsSchema.parse({ ...base, projectId: "none" }).projectId).toBeNull();
    expect(noteFieldsSchema.parse({ ...base, projectId: "" }).projectId).toBeNull();
  });

  it("normalises and caps tags", () => {
    expect(noteFieldsSchema.parse({ ...base, tags: "Car  car MAINTENANCE" }).tags).toEqual([
      "car",
      "maintenance",
    ]);

    const tooMany = Array.from({ length: 9 }, (_, i) => `tag${i}`).join(" ");
    expect(noteFieldsSchema.safeParse({ ...base, tags: tooMany }).success).toBe(false);
  });

  it("never rejects a note for having no body at all — an empty body is valid on its own", () => {
    expect(noteFieldsSchema.safeParse({ ...base, body: "" }).success).toBe(true);
  });
});

describe("updateNoteSchema", () => {
  const base = { title: "", body: "Some content", tags: "", projectId: "", id: VALID_ID };

  it("requires a real id", () => {
    expect(updateNoteSchema.safeParse({ ...base, id: "" }).success).toBe(false);
    expect(updateNoteSchema.safeParse(base).success).toBe(true);
  });

  it("refuses a note with neither a title nor any body content", () => {
    const result = updateNoteSchema.safeParse({ ...base, body: "" });
    expect(result.success).toBe(false);
    expect(result.success ? null : result.error.issues[0]?.message).toBe(
      "A note needs a title or some content.",
    );
  });

  it("accepts a title alone, with no body", () => {
    expect(updateNoteSchema.safeParse({ ...base, title: "Placeholder", body: "" }).success).toBe(
      true,
    );
  });

  it("accepts a body alone, with no title", () => {
    expect(updateNoteSchema.safeParse({ ...base, title: "", body: "Some content" }).success).toBe(
      true,
    );
  });

  it("refuses whitespace-only title and body together", () => {
    expect(updateNoteSchema.safeParse({ ...base, title: "   ", body: "  \n " }).success).toBe(
      false,
    );
  });
});

describe("setNotePinnedSchema", () => {
  it("parses the string form a checkbox/button submits", () => {
    expect(setNotePinnedSchema.parse({ id: VALID_ID, pinned: "true" }).pinned).toBe(true);
    expect(setNotePinnedSchema.parse({ id: VALID_ID, pinned: "false" }).pinned).toBe(false);
  });

  it("also accepts a real boolean", () => {
    expect(setNotePinnedSchema.parse({ id: VALID_ID, pinned: true }).pinned).toBe(true);
  });
});
