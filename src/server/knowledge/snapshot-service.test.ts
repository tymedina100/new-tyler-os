import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readKnowledge } from "./knowledge-service";
import { readWorkBoard } from "./work-board-service";
import { readSnapshotSource } from "./snapshot-repository";
import { knowledgeFixture, boardFixture } from "../../../tests/support/knowledge-fixtures";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "tyleros-sources-"));
  for (const key of [
    "TYLEROS_KNOWLEDGE_PATH",
    "TYLEROS_KNOWLEDGE_JSON",
    "TYLEROS_WORK_BOARD_PATH",
    "TYLEROS_WORK_BOARD_JSON",
  ])
    vi.stubEnv(key, undefined);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it("distinguishes an absent connection from an unreadable configured source", async () => {
  expect((await readKnowledge()).health.status).toBe("not_configured");
  vi.stubEnv("TYLEROS_KNOWLEDGE_PATH", join(directory, "missing.json"));
  expect((await readKnowledge()).health.status).toBe("unavailable");
});
it("isolates malformed knowledge from valid shared tasks and recovers after a corrected import", async () => {
  const path = join(directory, "knowledge.json");
  vi.stubEnv("TYLEROS_KNOWLEDGE_PATH", path);
  vi.stubEnv("TYLEROS_WORK_BOARD_JSON", JSON.stringify(boardFixture()));
  await writeFile(path, '{"private-invalid-content":');
  const failed = await readKnowledge();
  expect(failed.health.status).toBe("unavailable");
  expect(JSON.stringify(failed)).not.toContain("private-invalid-content");
  expect((await readWorkBoard()).entries[0]?.title).toBe("Synthetic shared work");
  await writeFile(path, JSON.stringify(knowledgeFixture()));
  const recovered = await readKnowledge("household", new Date("2026-09-09T12:00:00Z"));
  expect(recovered.health.status).toBe("available");
  expect(recovered.entries[0]?.sourceHealth.reviewStatus).toBe("due");
  expect((await readKnowledge("not found")).health.status).toBe("available");
});
it("isolates corrupt shared tasks and never falls back to an obsolete inline copy", async () => {
  vi.stubEnv("TYLEROS_KNOWLEDGE_JSON", JSON.stringify(knowledgeFixture()));
  vi.stubEnv("TYLEROS_WORK_BOARD_JSON", JSON.stringify(boardFixture()));
  vi.stubEnv("TYLEROS_WORK_BOARD_PATH", join(directory, "missing.json"));
  expect((await readWorkBoard()).health.status).toBe("unavailable");
  expect((await readKnowledge()).entries).toHaveLength(1);
});
it("enforces byte limits on multibyte inline data, files, and non-file paths", async () => {
  await expect(readSnapshotSource(undefined, "éé", 3)).rejects.toThrow("large");
  const path = join(directory, "large");
  await writeFile(path, "12345");
  await expect(readSnapshotSource(path, undefined, 4)).rejects.toThrow();
  expect(await readSnapshotSource(path, undefined, 5)).toBe("12345");
  await expect(readSnapshotSource(directory, undefined, 10)).rejects.toThrow();
});
it("reports schema-invalid source URLs as unavailable rather than exposing them", async () => {
  const fixture = knowledgeFixture();
  fixture.entries[0]!.sourceUrl = "https://evil.example/source";
  vi.stubEnv("TYLEROS_KNOWLEDGE_JSON", JSON.stringify(fixture));
  expect(await readKnowledge()).toMatchObject({ entries: [], health: { status: "unavailable" } });
});
