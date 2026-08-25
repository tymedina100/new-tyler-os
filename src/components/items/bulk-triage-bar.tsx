"use client";

import { Button } from "@/components/ui/button";

/**
 * What happens to everything marked.
 *
 * The keyboard can already do all of this, but a bar that only appears once
 * something is marked is also the clearest possible statement of what the next
 * keystroke will affect — and it gives the same power to a pointer, where
 * holding a shortcut vocabulary in your head is not an option.
 *
 * Types are keyboard-only in bulk: five more buttons here would drown the four
 * operations people actually reach for, and a single row's type is one click
 * away in its own menu.
 */
export function BulkTriageBar({
  count,
  onMakeTasks,
  onDueToday,
  onComplete,
  onSomeday,
  onArchive,
  onClear,
}: {
  count: number;
  onMakeTasks: () => void;
  onDueToday: () => void;
  onComplete: () => void;
  onSomeday: () => void;
  onArchive: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="status"
      className="border-border bg-card flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
    >
      <span className="font-medium">{count} marked</span>
      <Button variant="secondary" size="sm" onClick={onMakeTasks}>
        Make tasks
      </Button>
      <Button variant="secondary" size="sm" onClick={onDueToday}>
        Due today
      </Button>
      <Button variant="secondary" size="sm" onClick={onComplete}>
        Complete
      </Button>
      <Button variant="secondary" size="sm" onClick={onSomeday}>
        Someday
      </Button>
      <Button variant="secondary" size="sm" onClick={onArchive}>
        Archive
      </Button>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
