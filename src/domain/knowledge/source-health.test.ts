import { expect, it } from "vitest";
import { knowledgeSourceHealth, importAge } from "./source-health";
import type { KnowledgeEntry } from "./knowledge";
const entry: KnowledgeEntry = {
  id: "fixture",
  title: "Routine",
  body: "Fixture",
  sourceUrl: "https://app.notion.com/p/fixture",
  sourceEditedAt: "2026-08-01T00:00:00Z",
  importedAt: "2026-09-09T00:00:00Z",
  lastReviewed: "2026-09-01",
  freshness: "Weekly",
  sensitivity: "Normal",
  sourceHash: "a".repeat(64),
};
const now = new Date("2026-09-09T12:00:00Z");
it("does not let a new import reset a due source review", () => {
  expect(knowledgeSourceHealth(entry, now)).toMatchObject({
    reviewStatus: "due",
    reviewDueOn: "2026-09-08",
    importMessage: "Imported less than a day ago",
  });
});
it("uses calendar cadence, including month ends, and includes the due day", () => {
  expect(
    knowledgeSourceHealth(
      { ...entry, lastReviewed: "2026-01-31", freshness: "Monthly" },
      new Date("2026-02-28T12:00:00Z"),
    ),
  ).toMatchObject({ reviewDueOn: "2026-02-28", reviewStatus: "due" });
  expect(knowledgeSourceHealth({ ...entry, lastReviewed: "2026-09-08" }, now)).toMatchObject({
    reviewDueOn: "2026-09-15",
    reviewStatus: "not_due",
  });
});
it("leaves unknown cadences, missing, malformed and future reviews unverified", () => {
  for (const patch of [
    { freshness: "As needed" },
    { lastReviewed: null },
    { lastReviewed: "2026-02-30" },
    { lastReviewed: "2027-01-01" },
    { lastReviewed: "yesterday" },
  ]) {
    expect(knowledgeSourceHealth({ ...entry, ...patch }, now)).toMatchObject({
      reviewStatus: "unknown",
      reviewDueOn: null,
    });
  }
});
it("shows each entry's import age without claiming live freshness", () => {
  expect(importAge("2026-09-01T12:00:00Z", now)).toBe("Imported 8 days ago");
  expect(importAge("2026-09-08T12:00:00Z", now)).toBe("Imported 1 day ago");
  expect(importAge("2027-01-01T00:00:00Z", now)).toContain("unverified");
  expect(importAge("invalid", now)).toContain("unverified");
});
