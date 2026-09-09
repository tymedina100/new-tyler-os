import { readFile, stat } from "node:fs/promises";
import { activeSharedTasks, workBoardSnapshotSchema } from "@/domain/knowledge/work-board";
export async function readWorkBoard() {
  let raw = process.env.TYLEROS_WORK_BOARD_JSON;
  const path = process.env.TYLEROS_WORK_BOARD_PATH;
  if (path) {
    if ((await stat(path)).size > 1_000_000) throw new Error("Work Board snapshot exceeds 1 MB.");
    raw = await readFile(path, "utf8");
  }
  if (!raw) return { entries: [], mode: "snapshot" as const, asOf: null };
  if (raw.length > 1_000_000) throw new Error("Work Board snapshot exceeds 1 MB.");
  const snapshot = workBoardSnapshotSchema.parse(JSON.parse(raw));
  return { entries: activeSharedTasks(snapshot), mode: "snapshot" as const, asOf: snapshot.asOf };
}
