import { z } from "zod";
export const workBoardEntrySchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  status: z.enum([
    "Inbox",
    "Backlog",
    "Active",
    "Waiting",
    "Blocked on Tyler",
    "Complete",
    "Dropped",
  ]),
  nextAction: z.string().max(10000),
  sourceUrl: z
    .string()
    .url()
    .refine((value) => new URL(value).origin === "https://app.notion.com"),
  sourceEditedAt: z.string().datetime(),
  priority: z.string().max(10),
  owner: z.string().max(50),
  needsTyler: z.boolean(),
});
export const workBoardSnapshotSchema = z
  .object({
    version: z.literal(1),
    asOf: z.string().datetime(),
    entries: z.array(workBoardEntrySchema).max(500),
  })
  .refine(
    (value) => new Set(value.entries.map((entry) => entry.id)).size === value.entries.length,
    "Duplicate Work Board sources",
  );
export function activeSharedTasks(snapshot: z.infer<typeof workBoardSnapshotSchema>) {
  return snapshot.entries
    .filter((entry) => !["Complete", "Dropped"].includes(entry.status))
    .sort(
      (a, b) => Number(b.needsTyler) - Number(a.needsTyler) || a.priority.localeCompare(b.priority),
    );
}
