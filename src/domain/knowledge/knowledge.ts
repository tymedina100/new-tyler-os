import { z } from "zod";

const notionUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["app.notion.com", "www.notion.so", "notion.so"].includes(url.hostname)
    );
  }, "Knowledge links must point to Notion over HTTPS.");

export const knowledgeEntrySchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  body: z.string().max(100_000),
  sourceUrl: notionUrl,
  sourceEditedAt: z.string().datetime(),
  importedAt: z.string().datetime(),
  lastReviewed: z.string().nullable(),
  freshness: z.string().max(100),
  sensitivity: z.enum(["Normal", "Personal", "Sensitive"]),
  domain: z.string().max(100).optional(),
  knowledgeType: z.string().max(100).optional(),
  steward: z.string().max(100).optional(),
  status: z.string().max(100).optional(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const knowledgeSnapshotSchema = z
  .object({
    version: z.literal(1),
    asOf: z.string().datetime(),
    entries: z.array(knowledgeEntrySchema).max(500),
  })
  .refine(
    ({ entries }) => new Set(entries.map((entry) => entry.id)).size === entries.length,
    "Duplicate knowledge source IDs are not allowed.",
  );

export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;

export function searchKnowledge(entries: KnowledgeEntry[], query: string): KnowledgeEntry[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) =>
    words.every((word) => `${entry.title} ${entry.body}`.toLocaleLowerCase().includes(word)),
  );
}

/** Select by canonical properties, never by words in an arbitrary note title. */
export function palatePreferences<T extends KnowledgeEntry>(entries: T[]): T[] {
  return entries.filter(
    (entry) =>
      entry.domain === "Food & Drink" &&
      entry.knowledgeType === "Preference" &&
      entry.steward === "Palate" &&
      entry.status === "Active",
  );
}
export function knowledgeMetadata(properties: Record<string, unknown>) {
  const value = (key: string) =>
    typeof properties[key] === "string" ? (properties[key] as string) : undefined;
  return {
    domain: value("Domain"),
    knowledgeType: value("Knowledge Type"),
    steward: value("Steward"),
    status: value("Status"),
  };
}
