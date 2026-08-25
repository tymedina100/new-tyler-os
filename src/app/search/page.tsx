import { Search } from "lucide-react";
import type { Metadata } from "next";
import { ItemFilterBar } from "@/components/items/item-filter-bar";
import { ItemList } from "@/components/items/item-list";
import { ItemSection } from "@/components/items/item-section";
import { InventoryResults } from "@/components/kitchen/inventory-results";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import {
  kindsForFilter,
  parseKindFilter,
  parseStatusFilter,
  statusesForFilter,
} from "@/domain/items/item-filters";
import { todayIsoDate } from "@/domain/shared/date";
import { readParam } from "@/lib/search-params";
import { getDb } from "@/server/db/client";
import { findItems } from "@/server/items/item-service";
import { findInventory } from "@/server/kitchen/inventory-service";
import { listProjectsWithProgress } from "@/server/projects/project-service";

export const metadata: Metadata = { title: "Search" };

/**
 * Universal retrieval.
 *
 * One surface searches everything ever captured, whatever module it will one
 * day belong to. Unlike the tasks page it defaults to every status, because
 * looking something up is not the same as working through it.
 *
 * The form is a plain GET form, so search works without JavaScript and every
 * result set is a URL worth keeping.
 */
export default async function SearchPage(props: PageProps<"/search">) {
  const params = await props.searchParams;
  const db = getDb();

  const search = readParam(params.q);
  const kind = parseKindFilter(readParam(params.kind), "all");
  const status = parseStatusFilter(readParam(params.status), "all");
  const projectId = readParam(params.projectId);
  const tagName = readParam(params.tag);

  const hasCriteria = Boolean(
    search ??
    projectId ??
    tagName ??
    (kind !== "all" ? kind : undefined) ??
    (status !== "all" ? status : undefined),
  );

  const [items, inventory, projects] = await Promise.all([
    hasCriteria
      ? findItems(db, search, {
          kinds: kindsForFilter(kind),
          statuses: statusesForFilter(status),
          projectId,
          tagName,
        })
      : Promise.resolve([]),
    // Kitchen records are searched separately and shown separately. Folding them
    // into the item query would mean pretending a jar of olive oil is an Item.
    search ? findInventory(db, search) : Promise.resolve([]),
    listProjectsWithProgress(db),
  ]);

  const total = items.length + inventory.length;

  const today = todayIsoDate(new Date());

  return (
    <>
      <PageHeader
        title="Search"
        description={hasCriteria ? `${total} ${total === 1 ? "result" : "results"}` : undefined}
      />

      <form
        action="/search"
        className="border-border bg-card focus-within:border-ring mb-3 flex items-center gap-2 rounded-lg border px-3"
      >
        <Search aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <input
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Search everything you have captured…"
          aria-label="Search"
          autoComplete="off"
          className="placeholder:text-muted-foreground h-10 flex-1 bg-transparent text-sm outline-none"
        />
        {tagName ? <input type="hidden" name="tag" value={tagName} /> : null}
        {kind !== "all" ? <input type="hidden" name="kind" value={kind} /> : null}
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      </form>

      <ItemFilterBar projects={projects} defaultStatus="all" />

      {!hasCriteria ? (
        <EmptyState
          title="Search everything"
          description="Titles and notes are indexed by Postgres, so a half-remembered word is usually enough. The filters work on their own too."
        />
      ) : total === 0 ? (
        <EmptyState
          title="Nothing matched"
          description="Try a shorter word, or widen the filters."
        />
      ) : (
        <div className="grid gap-6">
          {items.length > 0 ? (
            <ItemSection title="Items" count={items.length}>
              <ItemList items={items} today={today} />
            </ItemSection>
          ) : null}

          {inventory.length > 0 ? (
            <ItemSection title="In the kitchen" count={inventory.length}>
              <InventoryResults items={inventory} today={today} />
            </ItemSection>
          ) : null}
        </div>
      )}
    </>
  );
}
