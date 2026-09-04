import type { ItemWithRelations } from "@/domain/items/item";
import type { InventoryItem } from "@/domain/kitchen/inventory";
import type { TodayView } from "@/domain/today/today-view";
import type { TodayContext, TodayContextItem } from "@/domain/runtime/today-context";
import type { IsoDate } from "@/domain/shared/date";

/**
 * Projects Today into the observe DTO. Titles and dates only — never bodies.
 */

function toItem(item: Pick<ItemWithRelations, "id" | "title" | "dueOn">): TodayContextItem {
  return { id: item.id, title: item.title, dueOn: item.dueOn };
}

export function projectTodayContext(
  today: IsoDate,
  view: TodayView<ItemWithRelations>,
  expiring: readonly InventoryItem[],
): TodayContext {
  return {
    today,
    overdue: view.overdue.map(toItem),
    dueToday: view.dueToday.map(toItem),
    upcoming: view.upcoming.map(toItem),
    needsTriage: view.needsTriage.map(toItem),
    expiringSoon: expiring.map((item) => ({
      id: item.id,
      name: item.name,
      location: item.location,
      expiresOn: item.expiresOn,
    })),
  };
}
