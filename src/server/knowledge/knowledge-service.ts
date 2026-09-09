import { knowledgeSnapshotSchema, searchKnowledge } from "@/domain/knowledge/knowledge";
import { knowledgeSourceHealth, type SnapshotHealth } from "@/domain/knowledge/source-health";
import { readSnapshotSource } from "./snapshot-repository";

/** Recoverable cache only. Broken imports must not hide the independent Work Board. */
export async function readKnowledge(query = "", now = new Date()) {
  try {
    const raw = await readSnapshotSource(
      process.env.TYLEROS_KNOWLEDGE_PATH,
      process.env.TYLEROS_KNOWLEDGE_JSON,
      10_000_000,
    );
    if (raw === null) return emptyKnowledge("not_configured");
    const snapshot = knowledgeSnapshotSchema.parse(JSON.parse(raw));
    return {
      entries: searchKnowledge(snapshot.entries, query.slice(0, 500)).map((entry) => ({
        ...entry,
        sourceHealth: knowledgeSourceHealth(entry, now),
      })),
      mode: "snapshot" as const,
      asOf: snapshot.asOf,
      health: {
        status: "available",
        message: "Saved Notion context. Importing does not verify or update the original.",
      } satisfies SnapshotHealth,
    };
  } catch {
    return emptyKnowledge("unavailable");
  }
}
function emptyKnowledge(status: "not_configured" | "unavailable") {
  return {
    entries: [],
    mode: "snapshot" as const,
    asOf: null,
    health: {
      status,
      message:
        status === "not_configured"
          ? "No personal knowledge snapshot is connected. App notes and shared tasks remain separate."
          : "Personal knowledge could not be loaded. Check the source import; app notes and shared tasks remain available.",
    } satisfies SnapshotHealth,
  };
}
