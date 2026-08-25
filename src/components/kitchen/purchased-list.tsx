"use client";

import { Check, PackagePlus, Undo2 } from "lucide-react";
import Link from "next/link";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { useAction } from "@/components/ui/use-action";
import type { ItemWithRelations } from "@/domain/items/item";
import { KITCHEN_LOCATION_LABELS, KITCHEN_LOCATIONS } from "@/domain/kitchen/inventory";
import { toggleItemCompletionAction } from "@/server/actions/item-actions";
import { cn } from "@/lib/cn";

/**
 * What has been bought but not yet put away.
 *
 * This is the one place the two domains meet. Buying milk does not make a
 * kitchen record on its own — plenty of shopping never becomes inventory worth
 * tracking — so the hand-off is an offer rather than an automatic step. It
 * carries the name across to the quick-add row and stops there, which removes
 * the retyping without pretending to know the quantity.
 */
export function PurchasedList({ items }: { items: readonly ItemWithRelations[] }) {
  const { isPending, run } = useAction();

  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "border-border bg-card flex items-center gap-3 rounded-lg border px-3 py-2",
            isPending && "opacity-60",
          )}
        >
          <span className="border-success bg-success text-background flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border">
            <Check aria-hidden className="size-3" strokeWidth={3} />
          </span>

          <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm line-through">
            {item.title}
          </span>

          <Menu>
            <MenuTrigger
              aria-label={`Put away ${item.title}`}
              className="text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs"
            >
              <PackagePlus aria-hidden className="size-3.5" />
              Put away
            </MenuTrigger>

            <MenuContent>
              <MenuLabel>Add to</MenuLabel>
              {KITCHEN_LOCATIONS.map((location) => (
                <MenuItem key={location} asChild>
                  <Link
                    href={`/kitchen?location=${location}&name=${encodeURIComponent(item.title)}`}
                  >
                    <PackagePlus aria-hidden />
                    {KITCHEN_LOCATION_LABELS[location]}
                  </Link>
                </MenuItem>
              ))}

              <MenuItem onSelect={() => run(() => toggleItemCompletionAction(item.id))}>
                <Undo2 aria-hidden />
                Not bought after all
              </MenuItem>
            </MenuContent>
          </Menu>
        </li>
      ))}
    </ul>
  );
}
