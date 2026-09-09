import { readFile, writeFile, mkdir, copyFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { workBoardSnapshotSchema } from "../src/domain/knowledge/work-board";
const [destination, source] = process.argv.slice(2);
if (!destination || !source)
  throw new Error("Pass private destination and complete Notion view export.");
const target = resolve(destination);
if (target.startsWith(resolve(import.meta.dirname, "..") + "/"))
  throw new Error("Personal snapshots must stay outside Git.");
const fetched = z
  .object({
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
    isError: z.boolean().optional(),
  })
  .parse(JSON.parse(await readFile(source, "utf8")));
if (fetched.isError) throw new Error("Notion export failed.");
const text = fetched.content.find((block) => block.type === "text")?.text;
if (!text) throw new Error("Missing Notion view result.");
const view = z
  .object({ has_more: z.literal(false), results: z.array(z.record(z.string(), z.unknown())) })
  .parse(JSON.parse(text));
const rows = view.results.map((row) => ({
  id: String(row.url).split("/").at(-1),
  title: row.Task,
  status: row.Status,
  nextAction: row["Next action"] ?? "",
  sourceUrl: row.url,
  sourceEditedAt: row["Last updated"],
  priority: row.Priority ?? "P3",
  owner: row["Owner bot"] ?? "Miles",
  needsTyler: row["Needs Tyler?"] === "__YES__",
}));
const snapshot = workBoardSnapshotSchema.parse({
  version: 1,
  asOf: new Date().toISOString(),
  entries: rows,
});
let previous: string | undefined;
try {
  previous = await readFile(target, "utf8");
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}
if (
  previous &&
  JSON.stringify(workBoardSnapshotSchema.parse(JSON.parse(previous)).entries) ===
    JSON.stringify(snapshot.entries)
) {
  console.log("No source changes.");
  process.exit(0);
}
await mkdir(dirname(target), { recursive: true, mode: 0o700 });
if (previous) await copyFile(target, `${target}.backup-${Date.now()}`);
const temporary = `${target}.${process.pid}.tmp`;
await writeFile(temporary, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
await rename(temporary, target);
console.log(
  `Saved ${rows.length} unique source records; original view export retained. No canonical tasks were changed.`,
);
