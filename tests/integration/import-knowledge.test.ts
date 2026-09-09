import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { knowledgeFixture } from "../support/knowledge-fixtures";

it("upgrades unchanged legacy imports with canonical metadata and then stays idempotent", () => {
  const directory = mkdtempSync(join(tmpdir(), "tyleros-knowledge-import-"));
  try {
    const target = join(directory, "snapshot.json");
    const source = join(directory, "fetch.json");
    const fixture = knowledgeFixture();
    const entry = fixture.entries[0]!;
    const text = JSON.stringify({
      page_last_edited_at: entry.sourceEditedAt,
      text: `<properties>${JSON.stringify({
        Topic: entry.title,
        url: entry.sourceUrl,
        Status: "Active",
        Sensitivity: "Normal",
        Domain: "Food & Drink",
        "Knowledge Type": "Preference",
        Steward: "Palate",
        Freshness: "Weekly",
        "date:Last Reviewed:start": entry.lastReviewed,
      })}</properties><content>${entry.body}</content>`,
    });
    entry.sourceHash = createHash("sha256").update(text).digest("hex");
    writeFileSync(target, JSON.stringify(fixture));
    writeFileSync(source, JSON.stringify({ content: [{ type: "text", text }] }));
    const run = () =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", resolve("scripts/import-knowledge.mts"), target, source],
        { encoding: "utf8" },
      );
    expect(run()).toContain("Imported 1 source revisions");
    const updated = readFileSync(target, "utf8");
    expect(JSON.parse(updated).entries[0]).toMatchObject({
      sourceHash: entry.sourceHash,
      sourceEditedAt: entry.sourceEditedAt,
      lastReviewed: entry.lastReviewed,
      domain: "Food & Drink",
      knowledgeType: "Preference",
      steward: "Palate",
      status: "Active",
    });
    expect(run()).toContain("No changes");
    expect(readFileSync(target, "utf8")).toBe(updated);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
