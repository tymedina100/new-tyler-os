import { describe, expect, it } from "vitest";
import { knowledgeEntrySchema, knowledgeSnapshotSchema, searchKnowledge } from "./knowledge";

const entry = {
  id: "synthetic-source",
  title: "Synthetic preference",
  body: "Prefer short planning lists",
  sourceUrl: "https://app.notion.com/p/synthetic",
  sourceEditedAt: "2026-09-01T00:00:00.000Z",
  importedAt: "2026-09-09T00:00:00.000Z",
  lastReviewed: "2026-09-01",
  freshness: "Weekly",
  sensitivity: "Normal" as const,
  sourceHash: "a".repeat(64),
};

describe("knowledge source boundary", () => {
  it("matches all words across title and body, without AI", () => {
    expect(searchKnowledge([entry], "PREFERENCE short")).toHaveLength(1);
    expect(searchKnowledge([entry], "preference missing")).toHaveLength(0);
  });
  it("rejects duplicate imports and unsafe source links", () => {
    expect(
      knowledgeSnapshotSchema.safeParse({
        version: 1,
        asOf: entry.importedAt,
        entries: [entry, entry],
      }).success,
    ).toBe(false);
    expect(
      knowledgeEntrySchema.safeParse({ ...entry, sourceUrl: "https://notion.so.evil.example/p/x" })
        .success,
    ).toBe(false);
    expect(
      knowledgeEntrySchema.safeParse({ ...entry, sourceUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
  });
});
