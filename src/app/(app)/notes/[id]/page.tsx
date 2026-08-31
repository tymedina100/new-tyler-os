import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteForm } from "@/components/notes/note-form";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/server/db/client";
import { getNote } from "@/server/notes/note-service";
import { listProjectRefs } from "@/server/projects/project-repository";

export async function generateMetadata(props: PageProps<"/notes/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const note = await getNote(getDb(), id);
  return { title: note ? note.title : "Note" };
}

export default async function NoteDetailPage(props: PageProps<"/notes/[id]">) {
  const { id } = await props.params;
  const db = getDb();

  const [note, projects] = await Promise.all([getNote(db, id), listProjectRefs(db)]);
  if (!note) notFound();

  return (
    <>
      <PageHeader title={note.title} />
      <NoteForm note={note} projects={projects} />
    </>
  );
}
