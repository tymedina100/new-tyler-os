import { CalendarDays, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KITCHEN_LOCATION_LABELS, type KitchenLocation } from "@/domain/kitchen/inventory";
import { bucketExpiry } from "@/domain/kitchen/inventory-rules";
import { formatDueDate, type IsoDate } from "@/domain/shared/date";
import { cn } from "@/lib/cn";

/**
 * Metadata badges for an inventory row.
 *
 * Only the expiry is ever coloured, and only when it is close or past — the same
 * restraint the item badges use. A fridge where every label is red teaches
 * nothing about which thing to cook tonight.
 */

export function LocationBadge({ location }: { location: KitchenLocation }) {
  return (
    <Badge>
      <MapPin aria-hidden className="size-3" />
      {KITCHEN_LOCATION_LABELS[location]}
    </Badge>
  );
}

export function ExpiryBadge({ expiresOn, today }: { expiresOn: IsoDate; today: IsoDate }) {
  const state = bucketExpiry(expiresOn, today);

  return (
    <Badge
      className={cn(
        state === "expired" && "border-destructive/40 text-destructive",
        state === "soon" && "border-primary/40 text-primary",
      )}
    >
      <CalendarDays aria-hidden className="size-3" />
      {state === "expired" ? "Expired " : ""}
      {formatDueDate(expiresOn, today)}
    </Badge>
  );
}

/**
 * The quantity, which is the thing being looked for when someone opens this
 * page, so it is text rather than a badge and sits first.
 */
export function QuantityLabel({ children }: { children: string }) {
  return <span className="text-foreground text-sm font-medium tabular-nums">{children}</span>;
}
