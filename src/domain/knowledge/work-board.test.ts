import { expect, it } from "vitest";
import { activeSharedTasks, workBoardSnapshotSchema } from "./work-board";
const entry = {
  id: "synthetic",
  title: "Synthetic task",
  status: "Active" as const,
  nextAction: "Test only",
  sourceUrl: "https://app.notion.com/p/synthetic",
  sourceEditedAt: "2026-09-09T00:00:00.000Z",
  priority: "P2",
  owner: "Forge",
  needsTyler: false,
};
it("excludes resolved records and prioritizes explicit needs-Tyler without manufacturing approvals", () => {
  const snapshot = {
    version: 1 as const,
    asOf: entry.sourceEditedAt,
    entries: [
      entry,
      { ...entry, id: "resolved", status: "Complete" as const },
      { ...entry, id: "needs", needsTyler: true },
    ],
  };
  expect(activeSharedTasks(snapshot).map((row) => row.id)).toEqual(["needs", "synthetic"]);
  expect(workBoardSnapshotSchema.safeParse({ ...snapshot, entries: [entry, entry] }).success).toBe(
    false,
  );
});
