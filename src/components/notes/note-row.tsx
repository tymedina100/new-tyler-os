"use client";

import { MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ProjectBadge, TagBadge } from "@/components/items/item-badges";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useAction } from "@/components/ui/use-action";
import { buildNoteExcerpt } from "@/domain/notes/note-rules";
import type { NoteWithRelations } from "@/domain/notes/note";
import { formatPastDate, type IsoDate, toIsoDate } from "@/domain/shared/date";
import { deleteNoteAction, setNotePinnedAction } from "@/server/actions/note-actions";
import { cn } from "@/lib/cn";

/**
 * One row in a list of notes.
 *
 * Pinning is optimistic — it is a toggle someone reaches for repeatedly
 * ("these are notes I keep needing") and should feel as instant as an item's
 * completion circle. Deleting is not: notes are the one record in TylerOS
 * more expensive to lose than to double-check, so it is the one delete in
 * this codebase that asks first (`window.confirm`) rather than acting on the
 * first click, same as every other row menu does.
 */
export function NoteRow({ note, today }: { note: NoteWithRelations; today: IsoDate }) {
  const { isPending, run } = useAction();
  const excerpt = buildNoteExcerpt(note.body);

  function togglePinned() {
    run(() => setNotePinnedAction(note.id, !note.pinned));
  }

  function remove() {
    if (!window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
    run(async () => {
      const result = await deleteNoteAction(note.id);
      if (result.ok) toast.success("Deleted.");
      return result;
    });
  }

  return (
    <li
      className={cn(
        "group border-border bg-card flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        "hover:border-input focus-within:border-input",
        isPending && "opacity-60",
      )}
    >
      <button
        type="button"
        aria-label={note.pinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
        aria-pressed={note.pinned}
        onClick={togglePinned}
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded transition-colors",
          note.pinned
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        {note.pinned ? (
          <Pin aria-hidden className="size-4" fill="currentColor" />
        ) : (
          <Pin aria-hidden className="size-4" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <Link
          href={`/notes/${note.id}`}
          className="block text-sm font-medium break-words hover:underline"
        >
          {note.title}
        </Link>

        {excerpt ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{excerpt}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {note.project ? <ProjectBadge project={note.project} /> : null}
          {note.tags.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} />
          ))}
          <span className="text-muted-foreground text-[0.6875rem]">
            {formatPastDate(toIsoDate(note.updatedAt), today)}
          </span>
        </div>
      </div>

      <Menu>
        <MenuTrigger
          aria-label={`Actions for ${note.title}`}
          className="text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted flex size-7 shrink-0 items-center justify-center rounded"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </MenuTrigger>

        <MenuContent>
          <MenuItem onSelect={togglePinned}>
            {note.pinned ? (
              <>
                <PinOff aria-hidden />
                Unpin
              </>
            ) : (
              <>
                <Pin aria-hidden />
                Pin
              </>
            )}
          </MenuItem>
          <MenuItem asChild>
            <Link href={`/notes/${note.id}`}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </MenuItem>

          <MenuSeparator />
          <MenuItem
            className="text-destructive data-[highlighted]:bg-destructive/10"
            onSelect={remove}
          >
            <Trash2 aria-hidden className="text-destructive!" />
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}
