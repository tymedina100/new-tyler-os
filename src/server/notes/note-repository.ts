import { desc, eq, ilike, or, sql } from "drizzle-orm";
import type { NoteWithRelations } from "@/domain/notes/note";
import type { Database } from "@/server/db/client";
import { type NewNoteRow, noteTags, notes } from "@/server/db/schema";

/**
 * Data access for notes.
 *
 * Repositories speak SQL and return domain shapes; the rules live in
 * `src/domain/notes/`. The search vector column is never selected — it is
 * large, and no caller reads it directly.
 */

interface NoteRecord {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; name: string } | null;
  noteTags: { tag: { id: string; name: string } }[];
}

function toNoteWithRelations(row: NoteRecord): NoteWithRelations {
  const { noteTags: links, ...note } = row;
  return { ...note, tags: links.map((link) => link.tag) };
}

const RELATIONS = {
  project: { columns: { id: true, name: true } },
  noteTags: { with: { tag: { columns: { id: true, name: true } } } },
} as const;

const WITHOUT_SEARCH_VECTOR = { searchVector: false } as const;

/** Pinned notes first, then most recently touched — see `compareNotesForDisplay`. */
const ORDER_BY = [desc(notes.pinned), desc(notes.updatedAt)];

export interface NoteListFilters {
  projectId?: string;
}

export async function listNotes(
  db: Database,
  filters: NoteListFilters = {},
): Promise<NoteWithRelations[]> {
  const rows = await db.query.notes.findMany({
    where: filters.projectId ? eq(notes.projectId, filters.projectId) : undefined,
    columns: WITHOUT_SEARCH_VECTOR,
    with: RELATIONS,
    orderBy: ORDER_BY,
    limit: 500,
  });

  return rows.map(toNoteWithRelations);
}

export async function findNoteById(db: Database, id: string): Promise<NoteWithRelations | null> {
  const row = await db.query.notes.findFirst({
    where: eq(notes.id, id),
    columns: WITHOUT_SEARCH_VECTOR,
    with: RELATIONS,
  });

  return row ? toNoteWithRelations(row) : null;
}

/**
 * Full-text search with a substring fallback — the exact shape
 * `searchItems` already uses (ADR 009), because notes are prose the same way
 * items are, not short product names like the kitchen's.
 */
export async function searchNotes(
  db: Database,
  query: string,
  limit = 50,
): Promise<NoteWithRelations[]> {
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;
  const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

  const rows = await db.query.notes.findMany({
    where: or(
      sql`${notes.searchVector} @@ ${tsQuery}`,
      ilike(notes.title, pattern),
      ilike(notes.body, pattern),
    ),
    columns: WITHOUT_SEARCH_VECTOR,
    with: RELATIONS,
    orderBy: [desc(sql`ts_rank(${notes.searchVector}, ${tsQuery})`), desc(notes.updatedAt)],
    limit,
  });

  return rows.map(toNoteWithRelations);
}

export async function insertNote(db: Database, values: NewNoteRow): Promise<string> {
  const [row] = await db.insert(notes).values(values).returning({ id: notes.id });

  if (!row) throw new Error("Insert returned no note id.");
  return row.id;
}

export async function updateNoteRow(
  db: Database,
  id: string,
  patch: Partial<NewNoteRow>,
): Promise<string | null> {
  const [row] = await db
    .update(notes)
    .set(patch)
    .where(eq(notes.id, id))
    .returning({ id: notes.id });

  return row?.id ?? null;
}

export async function deleteNoteRow(db: Database, id: string): Promise<boolean> {
  const rows = await db.delete(notes).where(eq(notes.id, id)).returning({ id: notes.id });
  return rows.length > 0;
}

export async function replaceNoteTags(
  db: Database,
  noteId: string,
  tagIds: readonly string[],
): Promise<void> {
  await db.delete(noteTags).where(eq(noteTags.noteId, noteId));

  if (tagIds.length > 0) {
    await db.insert(noteTags).values(tagIds.map((tagId) => ({ noteId, tagId })));
  }
}
