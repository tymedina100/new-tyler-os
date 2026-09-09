import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename, copyFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  knowledgeMetadata,
  knowledgeSnapshotSchema,
  type KnowledgeEntry,
} from "../src/domain/knowledge/knowledge";

// Tool fetch exports are kept outside Git. Originals are never modified.
// Usage: pnpm exec tsx scripts/import-knowledge.mts /private/knowledge.json source.json ...
const [destination, ...sources] = process.argv.slice(2);
if (!destination || sources.length === 0)
  throw new Error("Pass destination and Notion fetch JSON files.");
const target = resolve(destination);
const repository = resolve(import.meta.dirname, "..");
if (target.startsWith(repository + "/"))
  throw new Error("Personal snapshots must be outside the source repository.");
const importedAt = new Date().toISOString();
const entries = new Map<string, KnowledgeEntry>();
let prior = "";
try {
  await access(target);
  prior = await readFile(target, "utf8");
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}
if (prior)
  for (const entry of knowledgeSnapshotSchema.parse(JSON.parse(prior)).entries)
    entries.set(entry.id, entry);
let changed = 0;
for (const source of sources) {
  const raw: unknown = JSON.parse(await readFile(source, "utf8"));
  if (!raw || typeof raw !== "object" || !("content" in raw) || !Array.isArray(raw.content))
    throw new Error("Expected a Notion fetch export.");
  for (const block of raw.content) {
    if (!block || typeof block !== "object" || !("text" in block) || typeof block.text !== "string")
      continue;
    const page: unknown = JSON.parse(block.text);
    if (!page || typeof page !== "object" || !("text" in page) || typeof page.text !== "string")
      throw new Error("Missing fetched page text.");
    if (!("page_last_edited_at" in page) || typeof page.page_last_edited_at !== "string")
      throw new Error("Missing source edit timestamp.");
    if ("truncated" in page && page.truncated) throw new Error("Refusing truncated source.");
    const propertiesMatch = page.text.match(/<properties>\s*([\s\S]*?)\s*<\/properties>/);
    const contentMatch = page.text.match(/<content>\s*([\s\S]*?)\s*<\/content>/);
    if (!propertiesMatch || !contentMatch) throw new Error("Missing source properties or content.");
    const properties = JSON.parse(propertiesMatch[1]!) as Record<string, unknown>;
    if (properties.Status !== "Active" || !properties.Topic)
      throw new Error("Only active Second Brain entries may be imported.");
    if (properties.Sensitivity === "Sensitive")
      throw new Error("Sensitive records require a separately reviewed import.");
    const url = String(properties.url);
    const id = url.split("/").at(-1)!;
    const body = contentMatch[1]!
      .replace(/<mention-page url="([^"]+)"\s*\/>/g, "[Open source]($1)")
      .replace(/<callout[^>]*>|<\/callout>/g, "")
      .trim();
    const sourceHash = createHash("sha256").update(block.text).digest("hex");
    const metadata = knowledgeMetadata(properties);
    const existing = entries.get(id);
    if (
      existing?.sourceHash === sourceHash &&
      Object.entries(metadata).every(
        ([key, value]) => existing[key as keyof KnowledgeEntry] === value,
      )
    )
      continue;
    entries.set(id, {
      id,
      ...metadata,
      title: String(properties.Topic),
      body,
      sourceUrl: url,
      sourceEditedAt: page.page_last_edited_at,
      importedAt,
      lastReviewed:
        typeof properties["date:Last Reviewed:start"] === "string"
          ? properties["date:Last Reviewed:start"]
          : null,
      freshness: String(properties.Freshness ?? "Unknown"),
      sensitivity: properties.Sensitivity === "Personal" ? "Personal" : "Normal",
      sourceHash,
    });
    changed++;
  }
}
if (changed === 0) {
  console.log("No changes; all sources already imported.");
  process.exit(0);
}
const snapshot = knowledgeSnapshotSchema.parse({
  version: 1,
  asOf: importedAt,
  entries: [...entries.values()],
});
await mkdir(dirname(target), { recursive: true, mode: 0o700 });
if (prior) await copyFile(target, `${target}.backup-${Date.now()}`);
const temporary = `${target}.${process.pid}.tmp`;
await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n", { mode: 0o600 });
await rename(temporary, target);
console.log(
  `Imported ${changed} source revisions; ${entries.size} unique sources. Original exports retained. Roll back by restoring the dated backup.`,
);
