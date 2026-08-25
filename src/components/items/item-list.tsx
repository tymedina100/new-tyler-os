import { ItemRow } from "@/components/items/item-row";
import type { ItemWithRelations } from "@/domain/items/item";
import type { IsoDate } from "@/domain/shared/date";

export function ItemList({
  items,
  today,
}: {
  items: readonly ItemWithRelations[];
  today: IsoDate;
}) {
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} today={today} />
      ))}
    </ul>
  );
}
