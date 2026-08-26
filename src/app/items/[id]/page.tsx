import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemForm } from "@/components/items/item-form";
import { ItemSuggestions } from "@/components/items/item-suggestions";
import { PageHeader } from "@/components/ui/page-header";
import { ITEM_KIND_LABELS } from "@/domain/items/item";
import { formatLongDate, toIsoDate, todayIsoDate } from "@/domain/shared/date";
import { getDb } from "@/server/db/client";
import { getItem } from "@/server/items/item-service";
import { listProjectsWithProgress } from "@/server/projects/project-service";
import { listPendingSuggestionsForItem } from "@/server/suggestions/suggestion-service";

export async function generateMetadata(props: PageProps<"/items/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const item = await getItem(getDb(), id);
  return { title: item ? item.title : "Item" };
}

export default async function ItemPage(props: PageProps<"/items/[id]">) {
  const { id } = await props.params;
  const db = getDb();

  const item = await getItem(db, id);
  if (!item) notFound();

  const [projects, suggestions] = await Promise.all([
    listProjectsWithProgress(db),
    listPendingSuggestionsForItem(db, id),
  ]);

  return (
    <>
      <PageHeader
        title={item.title}
        description={`${ITEM_KIND_LABELS[item.kind]} · captured ${formatLongDate(toIsoDate(item.createdAt))}`}
      />

      {/*
        Above the form, not inside it. A proposal is not a field: accepting one
        writes through its own action immediately, where everything below is a
        draft that only exists until Save. Putting them in the same box would
        make it fair to assume the chips were part of the same submit.
      */}
      {suggestions.length > 0 ? (
        <div className="mb-4">
          <ItemSuggestions itemId={item.id} suggestions={suggestions} />
        </div>
      ) : null}

      <ItemForm item={item} projects={projects} today={todayIsoDate(new Date())} />
    </>
  );
}
