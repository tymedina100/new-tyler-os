"use client";

import {
  Archive,
  CalendarDays,
  CalendarOff,
  Check,
  MoreHorizontal,
  Pencil,
  Repeat,
  SkipForward,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useOptimistic } from "react";
import { toast } from "sonner";
import {
  DueBadge,
  KindBadge,
  ProjectBadge,
  RepeatBadge,
  TagBadge,
} from "@/components/items/item-badges";
import { ItemSuggestions } from "@/components/items/item-suggestions";
import { useAction } from "@/components/ui/use-action";
import { Badge } from "@/components/ui/badge";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { ITEM_KIND_LABELS, ITEM_KINDS, type ItemWithRelations } from "@/domain/items/item";
import type { ItemSuggestionView } from "@/domain/suggestions/suggestion";
import { RECURRENCE_PRESETS } from "@/domain/recurrence/recurrence";
import { addDays, formatDueDate, type IsoDate } from "@/domain/shared/date";
import {
  deleteItemAction,
  restoreItemAction,
  setItemDueDateAction,
  setItemKindAction,
  setItemRecurrenceAction,
  setItemStatusAction,
  skipItemOccurrenceAction,
  toggleItemCompletionAction,
} from "@/server/actions/item-actions";
import { cn } from "@/lib/cn";

interface ItemRowProps {
  item: ItemWithRelations;
  /** Passed from the server so the client never has to guess the date. */
  today: IsoDate;
  /**
   * What AI proposed about this item and the user has not decided about yet.
   * Empty on every row when AI is not configured, which is why nothing else
   * here has to know whether it is.
   */
  suggestions?: readonly ItemSuggestionView[];
  /**
   * Set by keyboard triage in the inbox. Elsewhere the row has no notion of
   * being "current" and these stay undefined.
   */
  selected?: boolean;
  /** Marked for bulk triage. The next action will include this row. */
  marked?: boolean;
  onSelect?: () => void;
  rowRef?: (node: HTMLLIElement | null) => void;
}

/**
 * One row of the system.
 *
 * Completion is optimistic because a checkbox that waits for a round trip feels
 * broken. Everything else runs in a transition and raises a toast if it fails -
 * a failed action must never look like a successful one.
 */
export function ItemRow({
  item,
  today,
  suggestions = [],
  selected,
  marked,
  onSelect,
  rowRef,
}: ItemRowProps) {
  const { isPending, run } = useAction();
  const [optimisticDone, setOptimisticDone] = useOptimistic(item.status === "done");

  const isArchived = item.status === "archived";
  const selectable = selected !== undefined;
  const recurrence = item.recurrence;

  /**
   * Ticking off a repeat looks like a bug unless it is narrated: the row is
   * checked for a moment, then comes back unchecked on a different date. The
   * toast is what turns that into "done, next Tuesday".
   */
  function settle(
    operation: () => ReturnType<typeof toggleItemCompletionAction>,
    verb: string,
    optimistic?: () => void,
  ): void {
    run(async () => {
      const result = await operation();
      if (result.ok && result.data.nextDueOn !== null) {
        toast.success(`${verb} Next: ${formatDueDate(result.data.nextDueOn, today)}.`);
      }
      return result;
    }, optimistic);
  }

  return (
    <li
      ref={rowRef}
      // Roving tabindex: the selected row is the list's single tab stop, so Tab
      // moves past the list rather than through every item in it.
      tabIndex={selectable ? (selected ? 0 : -1) : undefined}
      aria-current={selected ? "true" : undefined}
      data-marked={marked ? "true" : undefined}
      onFocus={onSelect}
      onClick={onSelect}
      className={cn(
        "group border-border bg-card flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        "hover:border-input focus-within:border-input",
        selectable && "outline-none",
        selected && "border-ring ring-ring/30 ring-2",
        // Marked rows are tinted rather than ringed, so "where I am" and "what
        // is included" stay visually distinct when a row is both.
        marked && "bg-muted border-input",
        isPending && "opacity-60",
        isArchived && "opacity-70",
      )}
    >
      {marked ? <span className="sr-only">Marked for bulk triage.</span> : null}

      <button
        type="button"
        aria-label={
          optimisticDone
            ? `Reopen ${item.title}`
            : recurrence
              ? `Complete this occurrence of ${item.title}`
              : `Complete ${item.title}`
        }
        aria-pressed={optimisticDone}
        onClick={() =>
          settle(
            () => toggleItemCompletionAction(item.id),
            "Done.",
            () => setOptimisticDone(!optimisticDone),
          )
        }
        className={cn(
          "mt-px flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border transition-colors",
          optimisticDone
            ? "border-success bg-success text-background"
            : "border-input hover:border-foreground",
        )}
      >
        {optimisticDone ? <Check aria-hidden className="size-3" strokeWidth={3} /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <Link
          href={`/items/${item.id}`}
          className={cn(
            "block text-sm font-medium break-words hover:underline",
            optimisticDone && "text-muted-foreground line-through",
          )}
        >
          {item.title}
        </Link>

        {item.body ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{item.body}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <KindBadge kind={item.kind} />
          {item.dueOn ? <DueBadge dueOn={item.dueOn} today={today} /> : null}
          {recurrence ? <RepeatBadge recurrence={recurrence} /> : null}
          {item.project ? <ProjectBadge project={item.project} /> : null}
          {item.tags.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} />
          ))}
          {item.status === "someday" ? <Badge>Someday</Badge> : null}
          {isArchived ? <Badge>Archived</Badge> : null}
        </div>

        {/*
          A line of its own, below the badges rather than among them. Mixing a
          proposal into the row of things TylerOS actually knows is exactly the
          confusion the dashed border exists to prevent, and a separate line
          costs nothing on the overwhelming majority of rows that have none.
        */}
        {suggestions.length > 0 ? (
          <div className="mt-1.5">
            <ItemSuggestions itemId={item.id} suggestions={suggestions} />
          </div>
        ) : null}
      </div>

      <Menu>
        <MenuTrigger
          aria-label={`Actions for ${item.title}`}
          className="text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted flex size-7 shrink-0 items-center justify-center rounded"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </MenuTrigger>

        <MenuContent>
          <MenuLabel>Type</MenuLabel>
          {ITEM_KINDS.map((kind) => (
            <MenuItem
              key={kind}
              onSelect={() => run(() => setItemKindAction(item.id, kind))}
              className={cn(item.kind === kind && "text-primary")}
            >
              {ITEM_KIND_LABELS[kind]}
            </MenuItem>
          ))}

          <MenuSeparator />
          <MenuLabel>Due</MenuLabel>
          <MenuItem onSelect={() => run(() => setItemDueDateAction(item.id, today))}>
            <CalendarDays aria-hidden />
            Today
          </MenuItem>
          <MenuItem onSelect={() => run(() => setItemDueDateAction(item.id, addDays(today, 1)))}>
            <CalendarDays aria-hidden />
            Tomorrow
          </MenuItem>
          {/* A repeat needs its date: the offer to clear it would only fail. */}
          {item.dueOn && !recurrence ? (
            <MenuItem onSelect={() => run(() => setItemDueDateAction(item.id, null))}>
              <CalendarOff aria-hidden />
              Clear due date
            </MenuItem>
          ) : null}

          <MenuSeparator />
          <MenuLabel>Repeats</MenuLabel>
          {recurrence ? (
            <>
              <MenuItem
                onSelect={() =>
                  settle(() => skipItemOccurrenceAction(item.id), "Skipped this one.")
                }
              >
                <SkipForward aria-hidden />
                Skip this one
              </MenuItem>
              <MenuItem
                onSelect={() =>
                  run(async () => {
                    const result = await setItemRecurrenceAction(item.id, null, null);
                    if (result.ok) toast.success("It no longer repeats.");
                    return result;
                  })
                }
              >
                <CalendarOff aria-hidden />
                Stop repeating
              </MenuItem>
            </>
          ) : (
            RECURRENCE_PRESETS.map((preset) => (
              <MenuItem
                key={preset.label}
                onSelect={() =>
                  run(async () => {
                    const result = await setItemRecurrenceAction(
                      item.id,
                      preset.frequency,
                      preset.interval,
                    );
                    if (result.ok && result.data.description) {
                      toast.success(`${result.data.description}.`);
                    }
                    return result;
                  })
                }
              >
                <Repeat aria-hidden />
                {preset.label}
              </MenuItem>
            ))
          )}

          <MenuSeparator />
          {isArchived ? (
            <MenuItem onSelect={() => run(() => restoreItemAction(item.id))}>
              <Undo2 aria-hidden />
              Restore to inbox
            </MenuItem>
          ) : (
            <>
              {item.status !== "someday" ? (
                <MenuItem onSelect={() => run(() => setItemStatusAction(item.id, "someday"))}>
                  <Undo2 aria-hidden />
                  Move to someday
                </MenuItem>
              ) : null}
              <MenuItem onSelect={() => run(() => setItemStatusAction(item.id, "archived"))}>
                <Archive aria-hidden />
                Archive
              </MenuItem>
            </>
          )}

          <MenuItem asChild>
            <Link href={`/items/${item.id}`}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </MenuItem>

          <MenuSeparator />
          <MenuItem
            className="text-destructive data-[highlighted]:bg-destructive/10"
            onSelect={() => run(() => deleteItemAction(item.id))}
          >
            <Trash2 aria-hidden className="text-destructive!" />
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}
