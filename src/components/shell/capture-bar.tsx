"use client";

import {
  CalendarDays,
  CornerDownLeft,
  FolderGit2,
  Hash,
  NotebookText,
  Plus,
  Repeat,
  TriangleAlert,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { matchNotePrefix } from "@/domain/capture/note-prefix";
import { parseCapture } from "@/domain/capture/parse-capture";
import type { ProjectRef } from "@/domain/projects/project";
import type { RecurrenceRule } from "@/domain/recurrence/recurrence";
import { describeRecurrence } from "@/domain/recurrence/recurrence";
import { formatDueDate, type IsoDate } from "@/domain/shared/date";
import { captureAction } from "@/server/actions/capture-actions";
import { isTypingTarget } from "@/lib/keyboard";
import { cn } from "@/lib/cn";

/** The one input every `c` press, mobile-nav tap, and command-palette
 * capture focuses — but only the header instance TylerOS renders on every
 * screen, never the project-scoped one on a project page. Two capture bars can
 * exist on `/projects/[id]` at once, and a duplicate DOM id would silently
 * make `document.getElementById` return the wrong one. */
export const CAPTURE_INPUT_ID = "capture-input";

/**
 * The capture bar.
 *
 * This is the single most important control in TylerOS, so it is present on
 * every screen, focusable with one key, and asks for nothing but text. Anything
 * that would slow a capture down - choosing a type, picking a date - belongs to
 * triage, not to this box.
 *
 * `#tag`, `@project`, a trailing date and a trailing repeat are parsed out of
 * the text, and the
 * result is previewed below the field as you type. The preview is not a
 * confirmation step: Enter still captures immediately. It exists because a box
 * that quietly rewrites what you typed is worse than one that never tried.
 *
 * The preview runs the same pure parser the server will run, with the same
 * reference date, so what it shows is what gets stored.
 */
export function CaptureBar({
  projectId,
  placeholder = "Capture anything…",
  today,
  projects,
}: {
  projectId?: string;
  placeholder?: string;
  today: IsoDate;
  projects: readonly ProjectRef[];
}) {
  const [state, formAction, isPending] = useActionState(captureAction, null);
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clearing the box after a successful capture is a state adjustment, not a
  // side effect: doing it in an effect would render the just-saved text once
  // more before wiping it.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setText("");
  }

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      // Focus returns to the box because the next capture is usually seconds
      // away. This is a DOM call, which is what an effect is actually for.
      inputRef.current?.focus();
    }
  }, [state]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      inputRef.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Checked before anything item-shaped: a `note:` capture never reaches
  // `parseCapture` at all, the same "decide the domain first" split the
  // server action makes. See src/domain/capture/note-prefix.ts and ADR 033.
  const noteBody = matchNotePrefix(text);

  const parsed = useMemo(
    () =>
      noteBody !== null || text.trim().length === 0
        ? null
        : parseCapture(text, { today, projects }),
    [text, today, projects, noteBody],
  );

  const project = parsed?.projectId
    ? (projects.find((candidate) => candidate.id === parsed.projectId) ?? null)
    : null;

  const error = state && !state.ok ? state.error : null;
  const hasPreview =
    noteBody !== null ||
    (parsed !== null &&
      (parsed.dueOn !== null ||
        project !== null ||
        parsed.tags.length > 0 ||
        parsed.unresolvedProject !== null ||
        parsed.recurrence !== null));

  return (
    <form ref={formRef} action={formAction} className="grid gap-1.5">
      <div
        className={cn(
          "bg-card flex items-center gap-2 rounded-lg border px-3 shadow-sm transition-colors",
          "focus-within:border-ring",
          error ? "border-destructive" : "border-border",
        )}
      >
        <Plus aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <input
          ref={inputRef}
          id={projectId ? undefined : CAPTURE_INPUT_ID}
          name="text"
          type="text"
          autoComplete="off"
          aria-label="Capture"
          aria-invalid={error ? true : undefined}
          aria-describedby={hasPreview ? "capture-preview" : undefined}
          placeholder={placeholder}
          maxLength={280}
          // Deliberately uncontrolled. Capture must accept text typed before the
          // page has hydrated, and a controlled value would replace it with the
          // empty initial state the moment React took over. The mirror below is
          // only for the preview, so the worst case is a preview that appears
          // one keystroke late rather than a capture that is silently lost.
          onChange={(event) => setText(event.target.value)}
          className="placeholder:text-muted-foreground h-11 flex-1 bg-transparent text-sm outline-none"
        />
        {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}

        <button
          type="submit"
          disabled={isPending}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded px-1.5 py-1 text-[0.6875rem] transition-colors disabled:opacity-50"
        >
          <CornerDownLeft aria-hidden className="size-3.5" />
          <span className="sr-only sm:not-sr-only">{isPending ? "Saving" : "Save"}</span>
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive px-1 text-xs">
          {error}
        </p>
      ) : noteBody !== null ? (
        <NotePreview body={noteBody} />
      ) : hasPreview && parsed !== null ? (
        <CapturePreview
          title={parsed.title}
          dueOn={parsed.dueOn}
          today={today}
          project={project}
          tags={parsed.tags}
          unresolved={parsed.unresolvedProject}
          recurrence={parsed.recurrence}
        />
      ) : (
        <p className="text-muted-foreground hidden px-1 text-xs sm:block">
          Press <Key>c</Key> to capture, <Key>⌘</Key>
          <Key>K</Key> for commands. Add <Key>#tags</Key>, <Key>@project</Key> or a date inline.
          Start with <Key>note:</Key> to write a note instead.
        </p>
      )}
    </form>
  );
}

/**
 * What the capture will become, shown while it is still editable. Deliberately
 * a single quiet line: it informs, it does not ask for a decision.
 */
function CapturePreview({
  title,
  dueOn,
  today,
  project,
  tags,
  unresolved,
  recurrence,
}: {
  title: string;
  dueOn: IsoDate | null;
  today: IsoDate;
  project: ProjectRef | null;
  tags: readonly string[];
  unresolved: { ref: string; reason: "unknown" | "ambiguous" } | null;
  recurrence: RecurrenceRule | null;
}) {
  return (
    <div
      id="capture-preview"
      aria-live="polite"
      className="text-muted-foreground flex flex-wrap items-center gap-1.5 px-1 text-xs"
    >
      <span className="text-foreground max-w-full truncate font-medium">{title}</span>

      {dueOn ? (
        <Chip>
          <CalendarDays aria-hidden className="size-3" />
          {formatDueDate(dueOn, today)}
        </Chip>
      ) : null}

      {/*
        Spelled out rather than summarised: "Every Tuesday" is what makes a
        repeat trustworthy before Enter, where a bare "Weekly" leaves the
        reader wondering which day it landed on. The date chip beside it says
        when the first one is.
      */}
      {recurrence && dueOn ? (
        <Chip>
          <Repeat aria-hidden className="size-3" />
          {describeRecurrence({ ...recurrence, anchorOn: dueOn, lastCompletedOn: null })}
        </Chip>
      ) : null}

      {project ? (
        <Chip>
          <FolderGit2 aria-hidden className="size-3" />
          {project.name}
        </Chip>
      ) : null}

      {tags.map((tag) => (
        <Chip key={tag}>
          <Hash aria-hidden className="size-3" />
          {tag}
        </Chip>
      ))}

      {unresolved ? (
        <span className="text-destructive inline-flex items-center gap-1">
          <TriangleAlert aria-hidden className="size-3" />
          {unresolved.reason === "ambiguous"
            ? `“@${unresolved.ref}” matches more than one project`
            : `No project called “${unresolved.ref}”`}
          <span className="text-muted-foreground">— kept in the title</span>
        </span>
      ) : null}
    </div>
  );
}

/**
 * What a `note:` capture will become. A different shape from the item
 * preview on purpose — there is nothing to parse out of it, so showing empty
 * date/project/tag chips would just be noise where "this is a note" is the
 * entire story.
 */
function NotePreview({ body }: { body: string }) {
  return (
    <div
      id="capture-preview"
      aria-live="polite"
      className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs"
    >
      <Chip>
        <NotebookText aria-hidden className="size-3" />
        New note
      </Chip>
      <span className="text-foreground max-w-full truncate font-medium">{body}</span>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border inline-flex items-center gap-1 rounded border px-1.5 py-0.5 leading-none">
      {children}
    </span>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="border-border bg-muted rounded border px-1 font-mono text-[0.6875rem]">
      {children}
    </kbd>
  );
}
