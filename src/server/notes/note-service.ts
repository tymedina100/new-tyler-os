import { deriveNoteTitle } from "@/domain/notes/note-rules";
import type { NoteWithRelations } from "@/domain/notes/note";
import type { CaptureNoteInput, UpdateNoteInput } from "@/domain/notes/note-schema";
import { NotFoundError } from "@/domain/shared/errors";
import type { Database } from "@/server/db/client";
import * as repo from "@/server/notes/note-repository";
import { deleteOrphanedTags, ensureTags } from "@/server/tags/tag-repository";

/**
 * Note use cases.
 *
 * Notes have no lifecycle to orchestrate — no status, no due date, nothing
 * that can be triaged. What is genuinely interesting here is title
 * derivation (`deriveNoteTitle`), which runs on every write so a note never
 * needs a title typed by hand to be findable in a list.
 */

export async function listNotes(
  db: Database,
  filters: repo.NoteListFilters = {},
): Promise<NoteWithRelations[]> {
  return repo.listNotes(db, filters);
}

export async function getNote(db: Database, id: string): Promise<NoteWithRelations | null> {
  return repo.findNoteById(db, id);
}

/**
 * The fast path: quick capture on the Notes index, and the `note:` prefix in
 * the global capture box (`src/domain/capture/note-prefix.ts`). Neither ever
 * reaches `after()`/AI — a note is never classified or summarised. See
 * docs/DECISIONS.md ADR 033.
 */
export async function captureNote(db: Database, input: CaptureNoteInput): Promise<string> {
  const title = deriveNoteTitle(null, input.body);
  return repo.insertNote(db, { title, body: input.body, projectId: input.projectId });
}

export async function updateNote(db: Database, input: UpdateNoteInput): Promise<string> {
  const title = deriveNoteTitle(input.title, input.body);

  return db.transaction(async (tx) => {
    const id = await repo.updateNoteRow(tx, input.id, {
      title,
      body: input.body,
      projectId: input.projectId,
    });
    if (id === null) throw new NotFoundError("Note", input.id);

    await attachTags(tx, id, input.tags);
    await deleteOrphanedTags(tx);
    return id;
  });
}

export async function setNotePinned(db: Database, id: string, pinned: boolean): Promise<void> {
  const updated = await repo.updateNoteRow(db, id, { pinned });
  if (updated === null) throw new NotFoundError("Note", id);
}

export async function deleteNote(db: Database, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await repo.deleteNoteRow(tx, id);
    if (!deleted) throw new NotFoundError("Note", id);
    await deleteOrphanedTags(tx);
  });
}

export async function findNotes(
  db: Database,
  query: string,
  limit?: number,
): Promise<NoteWithRelations[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  return repo.searchNotes(db, trimmed, limit);
}

async function attachTags(db: Database, noteId: string, names: readonly string[]): Promise<void> {
  const rows = await ensureTags(db, names);
  await repo.replaceNoteTags(
    db,
    noteId,
    rows.map((row) => row.id),
  );
}
