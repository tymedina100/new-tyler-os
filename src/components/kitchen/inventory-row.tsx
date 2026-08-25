"use client";

import { ArrowRight, MoreHorizontal, Pencil, ShoppingCart, Trash2, Utensils } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ExpiryBadge, LocationBadge, QuantityLabel } from "@/components/kitchen/inventory-badges";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useAction } from "@/components/ui/use-action";
import {
  type InventoryItem,
  KITCHEN_LOCATION_LABELS,
  KITCHEN_LOCATIONS,
} from "@/domain/kitchen/inventory";
import { formatQuantity } from "@/domain/kitchen/inventory-rules";
import type { IsoDate } from "@/domain/shared/date";
import {
  deleteInventoryItemAction,
  setInventoryLocationAction,
  markUsedUpAction,
} from "@/server/actions/inventory-actions";
import { cn } from "@/lib/cn";

/**
 * One thing in the kitchen.
 *
 * Read standing at an open fridge, so the quantity leads and the row stays one
 * glance tall. The two ways something leaves are deliberately different verbs:
 * using the last of the milk means you now need milk, whereas deleting a record
 * you typed twice should not put anything on a shopping list.
 */
export function InventoryRow({
  item,
  today,
  showLocation = true,
}: {
  item: InventoryItem;
  today: IsoDate;
  /** Hidden when the list is already filtered to one location. */
  showLocation?: boolean;
}) {
  const { isPending, run } = useAction();

  const elsewhere = KITCHEN_LOCATIONS.filter((location) => location !== item.location);

  function useItUp() {
    run(async () => {
      const result = await markUsedUpAction(item.id);
      if (result.ok) toast.success(`Used up. ${result.data.name} is on the shopping list.`);
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
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link
            href={`/kitchen/${item.id}`}
            className="text-sm font-medium break-words hover:underline"
          >
            {item.name}
          </Link>
          <QuantityLabel>{formatQuantity(item.quantity, item.unit)}</QuantityLabel>
        </div>

        {item.notes ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{item.notes}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {showLocation ? <LocationBadge location={item.location} /> : null}
          {item.expiresOn ? <ExpiryBadge expiresOn={item.expiresOn} today={today} /> : null}
        </div>
      </div>

      <Menu>
        <MenuTrigger
          aria-label={`Actions for ${item.name}`}
          className="text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted flex size-7 shrink-0 items-center justify-center rounded"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </MenuTrigger>

        <MenuContent>
          <MenuItem onSelect={useItUp}>
            <Utensils aria-hidden />
            Used it up
          </MenuItem>
          <MenuItem asChild>
            <Link href={`/kitchen/${item.id}`}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </MenuItem>

          <MenuSeparator />
          <MenuLabel>Move to</MenuLabel>
          {elsewhere.map((location) => (
            <MenuItem
              key={location}
              onSelect={() => run(() => setInventoryLocationAction(item.id, location))}
            >
              <ArrowRight aria-hidden />
              {KITCHEN_LOCATION_LABELS[location]}
            </MenuItem>
          ))}

          <MenuSeparator />
          <MenuItem asChild>
            <Link href={`/kitchen/shopping?add=${encodeURIComponent(item.name)}`}>
              <ShoppingCart aria-hidden />
              Add to shopping
            </Link>
          </MenuItem>

          <MenuSeparator />
          <MenuItem
            className="text-destructive data-[highlighted]:bg-destructive/10"
            onSelect={() => run(() => deleteInventoryItemAction(item.id))}
          >
            <Trash2 aria-hidden className="text-destructive!" />
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}
