import type { Metadata } from "next";
import { NoteList } from "@/components/notes/note-list";
import { NoteQuickCapture } from "@/components/notes/note-quick-capture";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { todayIsoDate } from "@/domain/shared/date";
import { getDb } from "@/server/db/client";
import { listNotes } from "@/server/notes/note-service";

export const metadata: Metadata = { title: "Notes" };

/**
 * What you know.
 *
 * TASKS answers "what should I do," UPCOMING "what is happening," KITCHEN
 * "what do I have," SEARCH "where did I put it." This is "what do I know" —
 * durable knowledge with no lifecycle of its own. See docs/DECISIONS.md
 * ADR 033.
 *
 * Pinned notes first, then most recently touched — `compareNotesForDisplay`,
 * applied by the repository's own ORDER BY rather than recomputed here.
 */
export default async function NotesPage() {
  const db = getDb();
  const notes = await listNotes(db);
  const today = todayIsoDate(new Date());

  return (
    <>
      <PageHeader
        title="Notes"
        description={`${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
      />

      <NoteQuickCapture />

      {notes.length === 0 ? (
        <EmptyState
          title="Nothing written yet"
          description="Car maintenance facts, apartment measurements, an idea, a plan that isn't a task yet — write it above."
        />
      ) : (
        <NoteList notes={notes} today={today} />
      )}
    </>
  );
}
