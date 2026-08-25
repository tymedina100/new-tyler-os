import { Refrigerator } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ItemList } from "@/components/items/item-list";
import { ItemSection } from "@/components/items/item-section";
import { PurchasedList } from "@/components/kitchen/purchased-list";
import { ShoppingAdd } from "@/components/kitchen/shopping-add";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { todayIsoDate } from "@/domain/shared/date";
import { readParam } from "@/lib/search-params";
import { getDb } from "@/server/db/client";
import { listItemsForView } from "@/server/items/item-service";

export const metadata: Metadata = { title: "Shopping" };

/**
 * The shopping list.
 *
 * These are items, not kitchen records — "buy more olive oil" is something to
 * act on, so it lives on the item spine and gets capture, tags, search and the
 * ordinary completion toggle for free. See ADR 021.
 */
export default async function ShoppingPage(props: PageProps<"/kitchen/shopping">) {
  const params = await props.searchParams;
  const db = getDb();

  const [toBuy, purchased] = await Promise.all([
    listItemsForView(db, { kinds: ["purchase"], statuses: ["inbox", "active", "someday"] }),
    listItemsForView(db, { kinds: ["purchase"], statuses: ["done"] }),
  ]);

  const today = todayIsoDate(new Date());

  return (
    <>
      <PageHeader
        title="Shopping"
        description={`${toBuy.length} to buy`}
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/kitchen">
              <Refrigerator aria-hidden />
              Kitchen
            </Link>
          </Button>
        }
      />

      <ShoppingAdd defaultName={readParam(params.add)} />

      <div className="grid gap-6">
        {toBuy.length === 0 && purchased.length === 0 ? (
          <EmptyState
            title="Nothing to buy"
            description="Add something above, or use up the last of something in the kitchen and it will land here."
          />
        ) : null}

        {toBuy.length > 0 ? (
          <ItemSection title="To buy" count={toBuy.length}>
            <ItemList items={toBuy} today={today} />
          </ItemSection>
        ) : null}

        {purchased.length > 0 ? (
          <ItemSection title="Bought" count={purchased.length}>
            <PurchasedList items={purchased} />
          </ItemSection>
        ) : null}
      </div>
    </>
  );
}
