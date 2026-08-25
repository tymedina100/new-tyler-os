"use client";

import {
  Archive,
  CalendarDays,
  CalendarOff,
  Check,
  MoreHorizontal,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { DueBadge, KindBadge, ProjectBadge, TagBadge } from "@/components/items/item-badges";
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
import { addDays, type IsoDate } from "@/domain/shared/date";
import type { ActionResult } from "@/server/action-result";
import {
  deleteItemAction,
  restoreItemAction,
  setItemDueDateAction,
  setItemKindAction,
  setItemStatusAction,
  toggleItemCompletionAction,
} from "@/server/actions/item-actions";
import { cn } from "@/lib/cn";

interface ItemRowProps {
  item: ItemWithRelations;
  /** Passed from the server so the client never has to guess the date. */
  today: IsoDate;
}

/**
 * One row of the system.
 *
 * Completion is optimistic because a checkbox that waits for a round trip feels
 * broken. Everything else runs in a transition and raises a toast if it fails -
 * a failed action must never look like a successful one.
 */
export function ItemRow({ item, today }: ItemRowProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDone, setOptimisticDone] = useOptimistic(item.status === "done");

  function run(action: () => Promise<ActionResult<unknown>>, optimistic?: () => void) {
    startTransition(async () => {
      optimistic?.();
      const result = await action();
      if (!result.ok) toast.error(result.error);
    });
  }

  const isArchived = item.status === "archived";

  return (
    <li
      className={cn(
        "group border-border bg-card flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        "hover:border-input focus-within:border-input",
        isPending && "opacity-60",
        isArchived && "opacity-70",
      )}
    >
      <button
        type="button"
        aria-label={optimisticDone ? `Reopen ${item.title}` : `Complete ${item.title}`}
        aria-pressed={optimisticDone}
        onClick={() =>
          run(
            () => toggleItemCompletionAction(item.id),
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
          {item.project ? <ProjectBadge project={item.project} /> : null}
          {item.tags.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} />
          ))}
          {item.status === "someday" ? <Badge>Someday</Badge> : null}
          {isArchived ? <Badge>Archived</Badge> : null}
        </div>
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
          {item.dueOn ? (
            <MenuItem onSelect={() => run(() => setItemDueDateAction(item.id, null))}>
              <CalendarOff aria-hidden />
              Clear due date
            </MenuItem>
          ) : null}

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
