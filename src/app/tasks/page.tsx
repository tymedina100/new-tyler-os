import type { Metadata } from "next";
import { ItemFilterBar } from "@/components/items/item-filter-bar";
import { ItemList } from "@/components/items/item-list";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { ITEM_KIND_LABELS } from "@/domain/items/item";
import {
  kindsForFilter,
  parseKindFilter,
  parseStatusFilter,
  statusesForFilter,
} from "@/domain/items/item-filters";
import { todayIsoDate } from "@/domain/shared/date";
import { readParam } from "@/lib/search-params";
import { getDb } from "@/server/db/client";
import { listItemsForView } from "@/server/items/item-service";
import { listProjectsWithProgress } from "@/server/projects/project-service";

export const metadata: Metadata = { title: "Tasks" };

/**
 * The working list.
 *
 * It defaults to open tasks because that is what "tasks" means day to day, but
 * the same page browses any kind and any status - one list view rather than
 * five near-identical CRUD pages, which is the trap this design is avoiding.
 */
export default async function TasksPage(props: PageProps<"/tasks">) {
  const params = await props.searchParams;
  const db = getDb();

  const kind = parseKindFilter(readParam(params.kind), "task");
  const status = parseStatusFilter(readParam(params.status), "open");
  const projectId = readParam(params.projectId);
  const tag = readParam(params.tag);

  const [items, projects] = await Promise.all([
    listItemsForView(db, {
      kinds: kindsForFilter(kind),
      statuses: statusesForFilter(status),
      projectId,
      tagName: tag,
    }),
    listProjectsWithProgress(db),
  ]);

  const today = todayIsoDate(new Date());
  const title = kind === "all" ? "Everything" : `${ITEM_KIND_LABELS[kind]}s`;

  return (
    <>
      <PageHeader
        title={title}
        description={`${items.length} ${items.length === 1 ? "item" : "items"}`}
      />

      <ItemFilterBar projects={projects} />

      {items.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="No items fit these filters. Widen them, or capture something new from the bar above."
        />
      ) : (
        <ItemList items={items} today={today} />
      )}
    </>
  );
}
