import { activeSharedTasks, workBoardSnapshotSchema } from "@/domain/knowledge/work-board";
import { importAge, type SnapshotHealth } from "@/domain/knowledge/source-health";
import { readSnapshotSource } from "./snapshot-repository";
export async function readWorkBoard(now = new Date()) {
  try {
    const raw = await readSnapshotSource(
      process.env.TYLEROS_WORK_BOARD_PATH,
      process.env.TYLEROS_WORK_BOARD_JSON,
      1_000_000,
    );
    if (raw === null) return emptyBoard("not_configured");
    const snapshot = workBoardSnapshotSchema.parse(JSON.parse(raw));
    return {
      entries: activeSharedTasks(snapshot),
      mode: "snapshot" as const,
      asOf: snapshot.asOf,
      health: {
        status: "available",
        message: `${importAge(snapshot.asOf, now)}. Task status is a snapshot; check the canonical task before acting.`,
      } satisfies SnapshotHealth,
    };
  } catch {
    return emptyBoard("unavailable");
  }
}
function emptyBoard(status: "not_configured" | "unavailable") {
  return {
    entries: [],
    mode: "snapshot" as const,
    asOf: null,
    health: {
      status,
      message:
        status === "not_configured"
          ? "No shared Work Board snapshot is connected."
          : "Shared Work Board could not be loaded. App tasks and personal knowledge remain separate.",
    } satisfies SnapshotHealth,
  };
}
