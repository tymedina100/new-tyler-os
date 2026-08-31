"use client";

import { ListPlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, startTransition, useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { NoteFields } from "@/components/notes/note-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { NoteWithRelations } from "@/domain/notes/note";
import { captureAction } from "@/server/actions/capture-actions";
import { deleteNoteAction, updateNoteAction } from "@/server/actions/note-actions";

/**
 * The full editor for a note.
 *
 * The exact draft-safety shape ADR 024 established for `ItemForm` — a note's
 * body is precisely the "somebody may keep editing while it saves" case that
 * ADR exists for, arguably more so than an item's, since a note is meant to
 * be written into at length. Three things kept apart on purpose:
 *
 *   - the **persisted snapshot** — `snapshot`, seeded from the server
 *   - the **local draft** — owned by `NoteFields`
 *   - **whether the draft has moved since the last save began** — `dirty`
 *
 * A newly persisted snapshot is adopted only when the draft is clean.
 */
export function NoteForm({
  note,
  projects,
}: {
  note: NoteWithRelations;
  projects: readonly { id: string; name: string }[];
}) {
  const [state, formAction, isSaving] = useActionState(updateNoteAction, null);
  const [isDeleting, startDeleting] = useTransition();
  const router = useRouter();

  const [snapshot, setSnapshot] = useState(note);
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [dirty, setDirty] = useState(false);

  // Adopting during render, not in an effect — see ItemForm for why: an
  // effect would paint the stale draft once before catching up. Values, not
  // identity, so an unrelated save elsewhere (any revalidation hands this
  // component a new `note` object) cannot remount a draft someone is
  // actively writing.
  if (!dirty && persistedSignature(note) !== persistedSignature(snapshot)) {
    setSnapshot(note);
    setDraftGeneration((generation) => generation + 1);
  }

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !state.fieldErrors ? state.error : null;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setDirty(false);
    startTransition(() => formAction(formData));
  }

  function remove() {
    if (!window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return;

    startDeleting(async () => {
      const result = await deleteNoteAction(note.id);
      if (result.ok) {
        toast.success("Deleted.");
        router.push("/notes");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-6">
      <form
        action={formAction}
        onSubmit={save}
        onChange={() => {
          if (!dirty) setDirty(true);
        }}
        className="grid gap-4"
      >
        <input type="hidden" name="id" value={note.id} />

        <NoteFields
          key={draftGeneration}
          note={snapshot}
          projects={projects}
          fieldErrors={fieldErrors}
        />

        {formError ? (
          <p role="alert" className="text-destructive text-sm">
            {formError}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save note"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>

      <CreateTaskFromNote title={note.title} />

      <div className="border-border flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
        <p className="text-muted-foreground text-sm">Deleting a note is permanent.</p>
        <Button variant="danger" size="sm" onClick={remove} disabled={isDeleting}>
          <Trash2 aria-hidden />
          Delete
        </Button>
      </div>
    </div>
  );
}

/**
 * The bridge from knowledge to action.
 *
 * Deliberately the *smallest* version: a text box seeded with the note's
 * title, posted through the same, unmodified `captureAction` every other
 * capture in TylerOS goes through — no new schema, no link stored between
 * the note and the resulting item. The note is never touched, deleted or
 * converted; ADR 013 still holds, because this is still just capture.
 */
function CreateTaskFromNote({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(title);
  const [isPending, startTaskTransition] = useTransition();

  if (!open) {
    return (
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <ListPlus aria-hidden />
          Create task from this note
        </Button>
      </div>
    );
  }

  function create() {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;

    startTaskTransition(async () => {
      const formData = new FormData();
      formData.set("text", trimmed);

      const result = await captureAction(null, formData);
      if (result.ok) {
        toast.success("Added to your inbox.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="border-border grid gap-2 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs font-medium">Create a task from this note</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Task title"
          maxLength={280}
          className="flex-1"
        />
        <div className="flex gap-2">
          <Button type="button" variant="primary" size="sm" onClick={create} disabled={isPending}>
            {isPending ? "Adding…" : "Add to inbox"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The editable fields of a note, flattened for comparison. */
function persistedSignature(note: NoteWithRelations): string {
  return JSON.stringify([note.title, note.body, note.projectId, note.tags.map((tag) => tag.name)]);
}
