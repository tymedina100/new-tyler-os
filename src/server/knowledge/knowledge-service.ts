import { readFile, stat } from "node:fs/promises";
import { knowledgeSnapshotSchema, searchKnowledge } from "@/domain/knowledge/knowledge";

/** Recoverable read cache only. No write path back into canonical Notion. */
export async function readKnowledge(query = "") {
  const path = process.env.TYLEROS_KNOWLEDGE_PATH;
  let raw = process.env.TYLEROS_KNOWLEDGE_JSON;
  if (path) {
    const info = await stat(path);
    if (info.size > 10_000_000) throw new Error("Knowledge snapshot exceeds 10 MB.");
    raw = await readFile(path, "utf8");
  }
  if (!raw) return { entries: [], mode: "snapshot" as const, asOf: null };
  if (raw.length > 10_000_000) throw new Error("Knowledge snapshot exceeds 10 MB.");
  const snapshot = knowledgeSnapshotSchema.parse(JSON.parse(raw));
  return {
    entries: searchKnowledge(snapshot.entries, query.slice(0, 500)),
    mode: "snapshot" as const,
    asOf: snapshot.asOf,
  };
}
