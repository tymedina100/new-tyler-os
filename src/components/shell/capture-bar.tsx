"use client";

import { CornerDownLeft, Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { captureItemAction } from "@/server/actions/item-actions";
import { cn } from "@/lib/cn";

/**
 * The capture bar.
 *
 * This is the single most important control in TylerOS, so it is present on
 * every screen, focusable with one key, and asks for nothing but text. Anything
 * that would slow a capture down - choosing a type, picking a date - belongs to
 * triage, not to this box.
 *
 * `#tag` is parsed out of the text server-side, so organising costs no extra
 * interaction for the cases where you already know where something goes.
 */
export function CaptureBar({
  projectId,
  placeholder = "Capture anything…",
}: {
  projectId?: string;
  placeholder?: string;
}) {
  const [state, formAction, isPending] = useActionState(captureItemAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      inputRef.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const error = state && !state.ok ? state.error : null;

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
          name="text"
          type="text"
          autoComplete="off"
          aria-label="Capture"
          aria-invalid={error ? true : undefined}
          placeholder={placeholder}
          maxLength={280}
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
      ) : (
        <p className="text-muted-foreground hidden px-1 text-xs sm:block">
          Press <Key>c</Key> to capture, <Key>⌘</Key>
          <Key>K</Key> for commands. Add <Key>#tags</Key> inline.
        </p>
      )}
    </form>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="border-border bg-muted rounded border px-1 font-mono text-[0.6875rem]">
      {children}
    </kbd>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
