import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InventoryForm } from "@/components/kitchen/inventory-form";
import { PageHeader } from "@/components/ui/page-header";
import { KITCHEN_LOCATION_LABELS } from "@/domain/kitchen/inventory";
import { formatQuantity } from "@/domain/kitchen/inventory-rules";
import { getDb } from "@/server/db/client";
import { getInventoryItem } from "@/server/kitchen/inventory-service";

export async function generateMetadata(props: PageProps<"/kitchen/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const item = await getInventoryItem(getDb(), id);
  return { title: item ? item.name : "Kitchen" };
}

export default async function InventoryItemPage(props: PageProps<"/kitchen/[id]">) {
  const { id } = await props.params;

  const item = await getInventoryItem(getDb(), id);
  if (!item) notFound();

  return (
    <>
      <PageHeader
        title={item.name}
        description={`${formatQuantity(item.quantity, item.unit)} · ${KITCHEN_LOCATION_LABELS[item.location]}`}
      />
      <InventoryForm item={item} />
    </>
  );
}
