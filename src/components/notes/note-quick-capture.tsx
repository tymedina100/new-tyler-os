"use client";

import { NotebookText } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { createNoteAction } from "@/server/actions/note-actions";

/**
 * Writing a note is meant to be as close to "just start typing" as capturing
 * an item already is. One field — a title is derived from whatever the first
 * line turns out to be (`deriveNoteTitle`) — so there is nothing to decide
 * before Enter. Multi-line: unlike the single-line global capture box, this
 * one can hold a real paragraph, because it exists specifically to start a
 * note rather than to route between several kinds of thing.
 *
 * Sits permanently at the top of `/notes`, the same reason
 * `InventoryQuickAdd` sits at the top of `/kitchen`: an index is only worth
 * keeping true if adding to it costs almost nothing.
 */
export function NoteQuickCapture({ projectId }: { projectId?: string }) {
  const [state, formAction, isPending] = useActionState(createNoteAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      textareaRef.current?.focus();
    }
  }, [state]);

  const error = state && !state.ok ? state.error : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-label="Write a note"
      className="border-border bg-card mb-4 grid gap-2 rounded-lg border p-2.5"
    >
      <Textarea
        ref={textareaRef}
        name="body"
        placeholder="Write a note…"
        aria-label="Note"
        aria-invalid={error ? true : undefined}
        rows={3}
        maxLength={50_000}
        className="border-none px-1 py-0.5 shadow-none focus-visible:outline-none"
      />
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}

      <div className="flex items-center justify-between gap-2">
        {error ? (
          <p role="alert" className="text-destructive px-1 text-xs">
            {error}
          </p>
        ) : (
          <span />
        )}

        <Button type="submit" variant="primary" size="sm" disabled={isPending}>
          <NotebookText aria-hidden />
          {isPending ? "Saving" : "Save note"}
        </Button>
      </div>
    </form>
  );
}
