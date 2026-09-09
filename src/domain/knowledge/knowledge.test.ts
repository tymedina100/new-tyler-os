import { describe, expect, it } from "vitest";
import {
  knowledgeEntrySchema,
  knowledgeSnapshotSchema,
  searchKnowledge,
  knowledgeMetadata,
  palatePreferences,
} from "./knowledge";

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

describe("canonical Palate selection", () => {
  const metadata = {
    domain: "Food & Drink",
    knowledgeType: "Preference",
    steward: "Palate",
    status: "Active",
  };
  it("preserves canonical properties through snapshot parsing", () => {
    const mapped = knowledgeMetadata({
      Domain: "Food & Drink",
      "Knowledge Type": "Preference",
      Steward: "Palate",
      Status: "Active",
    });
    expect(mapped).toEqual(metadata);
    const parsed = knowledgeEntrySchema.parse({ ...entry, ...mapped });
    expect(palatePreferences([parsed])).toEqual([parsed]);
  });
  it("does not treat titles or incomplete metadata as authority", () => {
    expect(palatePreferences([{ ...entry, title: "Food & Drink Palate" }])).toEqual([]);
    for (const field of Object.keys(metadata)) {
      expect(palatePreferences([{ ...entry, ...metadata, [field]: "Other" }])).toEqual([]);
    }
    expect(palatePreferences([{ ...entry, ...metadata, status: "Archived" }])).toEqual([]);
    expect(knowledgeMetadata({ Domain: { select: "Food & Drink" } }).domain).toBeUndefined();
  });
});
