export function knowledgeFixture(asOf = "2026-09-09T12:00:00Z") {
  return {
    version: 1,
    asOf,
    entries: [
      {
        id: "synthetic-knowledge",
        title: "Synthetic household routine",
        body: "A fixture for source review. This is not personal context.",
        sourceUrl: "https://app.notion.com/p/synthetic-knowledge",
        sourceEditedAt: "2020-01-01T00:00:00Z",
        importedAt: "2020-01-02T00:00:00Z",
        lastReviewed: "2020-01-01",
        freshness: "Weekly",
        sensitivity: "Normal",
        sourceHash: "a".repeat(64),
      },
    ],
  };
}
export function boardFixture() {
  return {
    version: 1,
    asOf: "2020-01-02T00:00:00Z",
    entries: [
      {
        id: "synthetic-shared-task",
        title: "Synthetic shared work",
        status: "Active",
        nextAction: "Open the canonical source before acting.",
        sourceUrl: "https://app.notion.com/p/synthetic-shared-task",
        sourceEditedAt: "2020-01-01T00:00:00Z",
        priority: "P2",
        owner: "Miles",
        needsTyler: false,
      },
    ],
  };
}
