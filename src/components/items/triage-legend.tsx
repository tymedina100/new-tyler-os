"use client";

import { Keyboard } from "lucide-react";
import { ITEM_KIND_LABELS, ITEM_KINDS } from "@/domain/items/item";

/**
 * The shortcut vocabulary, written down where it is used.
 *
 * A keyboard interface nobody can discover is a keyboard interface nobody uses,
 * and a separate help page would go unread. This is the whole list — if it ever
 * needs a second column to fit, the vocabulary has grown too far.
 */
export const TRIAGE_SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "j / ↓", description: "Next item" },
  { keys: "k / ↑", description: "Previous item" },
  { keys: "1 – 5", description: "Set type, which files it out of the inbox" },
  { keys: "t", description: "Due today" },
  { keys: "x", description: "Complete" },
  { keys: "s", description: "Someday" },
  { keys: "a", description: "Archive" },
  { keys: "Space", description: "Mark for bulk triage" },
  { keys: "Esc", description: "Clear the marks" },
  { keys: "Enter", description: "Open the item" },
  { keys: "?", description: "Show or hide this list" },
];

export function Key({ children }: { children: string }) {
  return (
    <kbd className="border-border bg-muted rounded border px-1 font-mono text-[0.6875rem]">
      {children}
    </kbd>
  );
}

export function TriageLegend() {
  return (
    <dl className="border-border bg-card grid gap-1.5 rounded-lg border p-3 text-xs sm:grid-cols-2">
      {TRIAGE_SHORTCUTS.map(({ keys, description }) => (
        <div key={keys} className="flex items-center gap-2">
          <dt className="shrink-0">
            <Key>{keys}</Key>
          </dt>
          <dd className="text-muted-foreground">{description}</dd>
        </div>
      ))}
      <p className="text-muted-foreground sm:col-span-2">
        Types in order: {ITEM_KINDS.map((kind) => ITEM_KIND_LABELS[kind]).join(", ")}. An action
        applies to every marked item, or to the current one when nothing is marked.
      </p>
    </dl>
  );
}

export function ShortcutsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors"
    >
      <Keyboard aria-hidden className="size-3.5" />
      Shortcuts
    </button>
  );
}
