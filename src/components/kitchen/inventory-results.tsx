import Link from "next/link";
import { ExpiryBadge, LocationBadge } from "@/components/kitchen/inventory-badges";
import type { InventoryItem } from "@/domain/kitchen/inventory";
import { formatQuantity } from "@/domain/kitchen/inventory-rules";
import type { IsoDate } from "@/domain/shared/date";

/**
 * Inventory shown among search results.
 *
 * Rendered as its own labelled group rather than mixed into the item list,
 * because "there are two of these in the freezer" and "you meant to buy one"
 * are different kinds of answer and a reader needs to know which they are
 * looking at. Nothing here is converted into an Item to make it fit.
 */
export function InventoryResults({
  items,
  today,
}: {
  items: readonly InventoryItem[];
  today: IsoDate;
}) {
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="border-border bg-card hover:border-input rounded-lg border transition-colors"
        >
          <Link href={`/kitchen/${item.id}`} className="flex items-start gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium break-words">{item.name}</span>
                <span className="text-foreground text-sm font-medium tabular-nums">
                  {formatQuantity(item.quantity, item.unit)}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <LocationBadge location={item.location} />
                {item.expiresOn ? <ExpiryBadge expiresOn={item.expiresOn} today={today} /> : null}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
