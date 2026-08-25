import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/ui/page-header";
import { ITEM_KIND_LABELS } from "@/domain/items/item";
import { formatLongDate, toIsoDate } from "@/domain/shared/date";
import { getDb } from "@/server/db/client";
import { getItem } from "@/server/items/item-service";
import { listProjectsWithProgress } from "@/server/projects/project-service";

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

  const projects = await listProjectsWithProgress(db);

  return (
    <>
      <PageHeader
        title={item.title}
        description={`${ITEM_KIND_LABELS[item.kind]} · captured ${formatLongDate(toIsoDate(item.createdAt))}`}
      />
      <ItemForm item={item} projects={projects} />
    </>
  );
}
