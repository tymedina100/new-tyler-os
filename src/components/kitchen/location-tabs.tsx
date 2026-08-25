import Link from "next/link";
import {
  KITCHEN_LOCATION_LABELS,
  KITCHEN_LOCATIONS,
  type KitchenLocation,
} from "@/domain/kitchen/inventory";
import { cn } from "@/lib/cn";

/**
 * All / Fridge / Freezer / Pantry.
 *
 * Plain links, so the current view is a URL worth keeping and the back button
 * behaves — the same reason item filters live in search params.
 */
export function LocationTabs({
  active,
  counts,
}: {
  active: KitchenLocation | "all";
  counts: Map<KitchenLocation, number>;
}) {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  return (
    <nav aria-label="Kitchen locations" className="mb-3 flex flex-wrap gap-1.5">
      <Tab href="/kitchen" label="All" count={total} active={active === "all"} />
      {KITCHEN_LOCATIONS.map((location) => (
        <Tab
          key={location}
          href={`/kitchen?location=${location}`}
          label={KITCHEN_LOCATION_LABELS[location]}
          count={counts.get(location) ?? 0}
          active={active === location}
        />
      ))}
    </nav>
  );
}

function Tab({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[0.8125rem] transition-colors",
        active
          ? "border-input bg-muted text-foreground font-medium"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span className="text-muted-foreground text-[0.6875rem] tabular-nums">{count}</span>
    </Link>
  );
}
