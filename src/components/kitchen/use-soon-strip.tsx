import Link from "next/link";
import type { InventoryItem } from "@/domain/kitchen/inventory";
import { KITCHEN_LOCATION_LABELS } from "@/domain/kitchen/inventory";
import { bucketExpiry } from "@/domain/kitchen/inventory-rules";
import { formatDueDate, type IsoDate } from "@/domain/shared/date";
import { cn } from "@/lib/cn";

/**
 * Food about to be wasted, on Today.
 *
 * Today is not a kitchen dashboard, and this is the only inventory that earns a
 * place on it: something going off in the next few days changes what you cook
 * tonight, which is exactly the test Today applies to everything else. It is one
 * line per thing, it renders nothing when there is nothing, and it sits last so
 * it can never push actual work down the page.
 */
export function UseSoonStrip({
  items,
  today,
}: {
  items: readonly InventoryItem[];
  today: IsoDate;
}) {
  return (
    <ul className="border-border bg-card divide-border divide-y rounded-lg border">
      {items.map((item) => {
        const expired =
          item.expiresOn !== null && bucketExpiry(item.expiresOn, today) === "expired";

        return (
          <li key={item.id}>
            <Link
              href={`/kitchen/${item.id}`}
              className="hover:bg-muted flex items-center gap-3 px-3 py-2 text-sm transition-colors"
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {KITCHEN_LOCATION_LABELS[item.location]}
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  expired ? "text-destructive" : "text-primary",
                )}
              >
                {item.expiresOn ? formatDueDate(item.expiresOn, today) : ""}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
