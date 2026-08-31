"use client";

import { useState } from "react";
import { NoteMarkdown } from "@/components/notes/note-markdown";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { MAX_TAGS_PER_NOTE, type NoteWithRelations } from "@/domain/notes/note";
import type { FieldErrors } from "@/server/action-result";
import { cn } from "@/lib/cn";

type EditorMode = "write" | "preview";

/**
 * The editable fields of a note — the local draft.
 *
 * Separate from `NoteForm` for the same reason `ItemFields` is separate from
 * `ItemForm` (ADR 024): this component **is** the draft, so it can be
 * discarded and re-seeded by remounting it, and only when the parent has
 * decided that is safe. Every uncontrolled `defaultValue` here reads from
 * the `note` prop, so a remount shows the canonical persisted values.
 *
 * The body is mirrored into local state — uncontrolled `<textarea>` for the
 * same reason the item editor's date field is (typing before hydration must
 * never be lost), state alongside it only so the "Preview" tab can render
 * the draft as it currently reads rather than what was last saved.
 */
export function NoteFields({
  note,
  projects,
  fieldErrors,
}: {
  /** The persisted snapshot this draft was seeded from. */
  note: NoteWithRelations;
  projects: readonly { id: string; name: string }[];
  fieldErrors?: FieldErrors;
}) {
  const [mode, setMode] = useState<EditorMode>("write");
  const [body, setBody] = useState(note.body);

  return (
    <>
      <Field
        label="Title"
        htmlFor="title"
        hint="Leave blank to use the first line of the note."
        errors={fieldErrors?.title}
      >
        <Input id="title" name="title" defaultValue={note.title} maxLength={200} />
      </Field>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="body" className="text-muted-foreground text-xs font-medium">
            Note
          </label>
          <div className="border-border bg-muted flex gap-0.5 rounded-md border p-0.5">
            <ModeButton active={mode === "write"} onClick={() => setMode("write")}>
              Write
            </ModeButton>
            <ModeButton active={mode === "preview"} onClick={() => setMode("preview")}>
              Preview
            </ModeButton>
          </div>
        </div>

        <div className={mode === "write" ? "block" : "hidden"}>
          <Textarea
            id="body"
            name="body"
            defaultValue={note.body}
            onChange={(event) => setBody(event.target.value)}
            rows={16}
            maxLength={50_000}
            className="font-mono text-[0.8125rem] leading-relaxed"
            placeholder="# Heading&#10;&#10;Markdown is supported — lists, `code`, checklists, links…"
          />
        </div>

        {mode === "preview" ? (
          <div className="border-border rounded-md border px-3 py-2.5">
            <NoteMarkdown body={body} />
          </div>
        ) : null}

        {fieldErrors?.body?.length ? (
          <p className="text-destructive text-xs" role="alert">
            {fieldErrors.body.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project" htmlFor="projectId" errors={fieldErrors?.projectId}>
          <Select id="projectId" name="projectId" defaultValue={note.projectId ?? "none"}>
            <option value="none">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Tags"
          htmlFor="tags"
          hint={`Space or comma separated. Up to ${MAX_TAGS_PER_NOTE}.`}
          errors={fieldErrors?.tags}
        >
          <Input
            id="tags"
            name="tags"
            defaultValue={note.tags.map((tag) => tag.name).join(" ")}
            placeholder="car maintenance"
          />
        </Field>
      </div>
    </>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
