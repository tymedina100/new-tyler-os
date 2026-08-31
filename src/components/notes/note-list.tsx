import { NoteRow } from "@/components/notes/note-row";
import type { NoteWithRelations } from "@/domain/notes/note";
import type { IsoDate } from "@/domain/shared/date";

export function NoteList({
  notes,
  today,
}: {
  notes: readonly NoteWithRelations[];
  today: IsoDate;
}) {
  return (
    <ul className="grid gap-2">
      {notes.map((note) => (
        <NoteRow key={note.id} note={note} today={today} />
      ))}
    </ul>
  );
}
