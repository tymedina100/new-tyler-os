"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BulkTriageBar } from "@/components/items/bulk-triage-bar";
import { ItemRow } from "@/components/items/item-row";
import { Key, ShortcutsToggle, TriageLegend } from "@/components/items/triage-legend";
import { useItemAction } from "@/components/items/use-item-action";
import { ITEM_KINDS, type ItemWithRelations } from "@/domain/items/item";
import type { IsoDate } from "@/domain/shared/date";
import type { ActionResult } from "@/server/action-result";
import {
  setItemDueDateAction,
  setItemKindAction,
  setItemStatusAction,
  toggleItemCompletionAction,
} from "@/server/actions/item-actions";
import { hasModifier, isTypingTarget } from "@/lib/keyboard";

/**
 * Keyboard triage for the inbox.
 *
 * Processing ten captures should cost ten keystrokes, not thirty round trips to
 * the mouse. The vocabulary is deliberately small and built entirely out of
 * operations the item lifecycle already has — nothing here invents a state so
 * that a key could exist.
 *
 * Marking items with Space turns the same keys into bulk triage, which is what
 * a backlog needs: a whole screenful of captures is usually the same kind of
 * thing, and deciding that once is the point.
 *
 * Every action is also reachable from the row's own menu, so touch and mouse
 * lose nothing.
 */
export function InboxTriage({
  items,
  today,
}: {
  items: readonly ItemWithRelations[];
  today: IsoDate;
}) {
  // The index is remembered alongside the id so that when a triaged item leaves
  // the list, the selection can fall to whatever took its place. Deriving the
  // current row from both keeps a run of triage feeling like a queue rather
  // than a list you keep losing your place in.
  const [selection, setSelection] = useState<{ id: string; index: number } | null>(null);
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { run } = useItemAction();
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const selected =
    selection === null
      ? null
      : (items.find((item) => item.id === selection.id) ??
        items[Math.min(selection.index, items.length - 1)] ??
        null);

  const selectedIndex = selected === null ? -1 : items.indexOf(selected);

  // Marks only mean anything while the item is still here to act on. Memoised
  // because the key handler depends on it and would otherwise be rebound on
  // every render.
  const present = useMemo(
    () => (marked.size === 0 ? [] : items.filter((item) => marked.has(item.id))),
    [items, marked],
  );

  const select = useCallback((item: ItemWithRelations, index: number) => {
    setSelection({ id: item.id, index });
  }, []);

  // Focus follows selection, so a screen reader announces the row and the
  // browser scrolls it into view for free.
  useEffect(() => {
    if (selected === null) return;
    rowRefs.current.get(selected.id)?.focus({ preventScroll: false });
  }, [selected]);

  const move = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      const from = selectedIndex === -1 ? (delta > 0 ? -1 : 0) : selectedIndex;
      // Clamped, not wrapped: running off the end of a queue should stop, not
      // silently send you back to the top of work you already did.
      const next = Math.min(Math.max(from + delta, 0), items.length - 1);
      const item = items[next];
      if (item !== undefined) setSelection({ id: item.id, index: next });
    },
    [items, selectedIndex],
  );

  /**
   * Applies one operation to the marked items, or to the current row when
   * nothing is marked. The marks are dropped afterwards: leaving them set is how
   * a second keystroke lands somewhere the user is no longer looking.
   */
  const apply = useCallback(
    (operation: (id: string) => Promise<ActionResult<unknown>>, targets: readonly string[]) => {
      if (targets.length === 0) return;
      run(async () => {
        for (const id of targets) {
          const result = await operation(id);
          if (!result.ok) return result;
        }
        return { ok: true, data: undefined };
      });
      setMarked(new Set());
    },
    [run],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || hasModifier(event)) return;

      if (event.key === "?") {
        event.preventDefault();
        setShowShortcuts((current) => !current);
        return;
      }
      if (event.key === "Escape" && marked.size > 0) {
        event.preventDefault();
        setMarked(new Set());
        return;
      }
      if (items.length === 0) return;

      const key = event.key;

      if (key === "j" || key === "ArrowDown") {
        event.preventDefault();
        move(1);
        return;
      }
      if (key === "k" || key === "ArrowUp") {
        event.preventDefault();
        move(-1);
        return;
      }

      // Everything below acts on something, so a first keystroke selects.
      const target = selected ?? items[0];
      if (target === undefined) return;
      if (selected === null && key !== "Enter") select(target, 0);

      if (key === " ") {
        event.preventDefault();
        setMarked((current) => {
          const next = new Set(current);
          if (next.has(target.id)) next.delete(target.id);
          else next.add(target.id);
          return next;
        });
        move(1);
        return;
      }

      const targets = present.length > 0 ? present.map((item) => item.id) : [target.id];

      const kindIndex = Number(key) - 1;
      if (Number.isInteger(kindIndex) && kindIndex >= 0 && kindIndex < ITEM_KINDS.length) {
        const kind = ITEM_KINDS[kindIndex];
        if (kind === undefined) return;
        event.preventDefault();
        apply((id) => setItemKindAction(id, kind), targets);
        return;
      }
      if (key === "t") {
        event.preventDefault();
        apply((id) => setItemDueDateAction(id, today), targets);
        return;
      }
      if (key === "x") {
        event.preventDefault();
        apply((id) => toggleItemCompletionAction(id), targets);
        return;
      }
      if (key === "s") {
        event.preventDefault();
        apply((id) => setItemStatusAction(id, "someday"), targets);
        return;
      }
      if (key === "a") {
        event.preventDefault();
        apply((id) => setItemStatusAction(id, "archived"), targets);
        return;
      }
      if (key === "Enter" && selected !== null) {
        event.preventDefault();
        rowRefs.current.get(target.id)?.querySelector("a")?.click();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [apply, items, marked, move, present, select, selected, today]);

  const markedIds = present.map((item) => item.id);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground hidden text-xs sm:block">
          Press <Key>j</Key> and <Key>k</Key> to move, <Key>1</Key>–<Key>5</Key> to set a type,{" "}
          <Key>Space</Key> to mark several.
        </p>
        <ShortcutsToggle
          open={showShortcuts}
          onToggle={() => setShowShortcuts((current) => !current)}
        />
      </div>

      {showShortcuts ? <TriageLegend /> : null}

      {present.length > 0 ? (
        <BulkTriageBar
          count={present.length}
          onMakeTasks={() => apply((id) => setItemKindAction(id, "task"), markedIds)}
          onDueToday={() => apply((id) => setItemDueDateAction(id, today), markedIds)}
          onComplete={() => apply((id) => toggleItemCompletionAction(id), markedIds)}
          onSomeday={() => apply((id) => setItemStatusAction(id, "someday"), markedIds)}
          onArchive={() => apply((id) => setItemStatusAction(id, "archived"), markedIds)}
          onClear={() => setMarked(new Set())}
        />
      ) : null}

      <ul className="grid gap-2">
        {items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            today={today}
            selected={item.id === selected?.id}
            marked={marked.has(item.id)}
            onSelect={() => select(item, index)}
            rowRef={(node) => {
              if (node === null) rowRefs.current.delete(item.id);
              else rowRefs.current.set(item.id, node);
            }}
          />
        ))}
      </ul>
    </div>
  );
}
