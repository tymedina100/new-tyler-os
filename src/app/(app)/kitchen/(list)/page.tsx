import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InventoryQuickAdd } from "@/components/kitchen/inventory-quick-add";
import { InventoryRow } from "@/components/kitchen/inventory-row";
import { LocationTabs } from "@/components/kitchen/location-tabs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { isKitchenLocation, KITCHEN_LOCATION_LABELS } from "@/domain/kitchen/inventory";
import { todayIsoDate } from "@/domain/shared/date";
import { readParam } from "@/lib/search-params";
import { getDb } from "@/server/db/client";
import { countInventoryByLocation, listInventory } from "@/server/kitchen/inventory-service";

export const metadata: Metadata = { title: "Kitchen" };

/**
 * What food is in the house.
 *
 * Structured records, not items: a jar of olive oil is a fact about the world
 * rather than something to act on. See docs/ARCHITECTURE.md and ADR 019.
 *
 * The page answers one question at a glance, so the quick-add row is permanent
 * and the list is sorted by what is about to go off.
 */
export default async function KitchenPage(props: PageProps<"/kitchen">) {
  const params = await props.searchParams;
  const db = getDb();

  const requested = readParam(params.location);
  const location = requested && isKitchenLocation(requested) ? requested : undefined;
  const prefillName = readParam(params.name);

  const [items, counts] = await Promise.all([
    listInventory(db, { location }),
    countInventoryByLocation(db),
  ]);

  const today = todayIsoDate(new Date());
  const where = location ? KITCHEN_LOCATION_LABELS[location] : "the kitchen";

  return (
    <>
      <PageHeader
        title="Kitchen"
        description={`${items.length} ${items.length === 1 ? "thing" : "things"} in ${where}`}
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/kitchen/shopping">
              <ShoppingCart aria-hidden />
              Shopping
            </Link>
          </Button>
        }
      />

      <LocationTabs active={location ?? "all"} counts={counts} />

      <InventoryQuickAdd defaultLocation={location ?? "pantry"} defaultName={prefillName} />

      {items.length === 0 ? (
        <EmptyState
          title={location ? `Nothing in the ${KITCHEN_LOCATION_LABELS[location]}` : "Nothing yet"}
          description="Add what is actually there using the row above. A name and a location is enough — the quantity can wait until it matters."
        />
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <InventoryRow
              key={item.id}
              item={item}
              today={today}
              showLocation={location === undefined}
            />
          ))}
        </ul>
      )}
    </>
  );
}
