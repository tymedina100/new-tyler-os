import { Repeat } from "lucide-react";
import Link from "next/link";
import { ItemList } from "@/components/items/item-list";
import { UseSoonStrip } from "@/components/kitchen/use-soon-strip";
import type { AgendaDay } from "@/domain/agenda/agenda";
import type { ItemWithRelations } from "@/domain/items/item";
import type { InventoryItem } from "@/domain/kitchen/inventory";
import { summarizeRecurrence } from "@/domain/recurrence/recurrence";
import { daysBetween, formatMonthDay, type IsoDate, weekdayName } from "@/domain/shared/date";

/**
 * One day of the coming fortnight.
 *
 * Each domain keeps the presentation it already has — items are item rows, food
 * is the same strip Today uses — because the point of the agenda is to show
 * what is coming, not to invent a third way of drawing everything.
 *
 * Repeats are the exception: they are drawn as text, not as rows, and they are
 * not actionable. A future occurrence has no row behind it, and a checkbox that
 * completed the *current* occurrence from next Tuesday's heading would be the
 * kind of quietly wrong behaviour this milestone exists to avoid.
 */
export function AgendaDaySection({
  day,
  today,
}: {
  day: AgendaDay<ItemWithRelations, InventoryItem>;
  today: IsoDate;
}) {
  return (
    <section className="grid gap-2">
      <h2 className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">{relativeDayName(day.date, today)}</span>
        <span className="text-muted-foreground text-xs">{formatMonthDay(day.date)}</span>
      </h2>

      {day.items.length > 0 ? <ItemList items={day.items} today={today} /> : null}

      {day.repeats.length > 0 ? (
        <ul className="border-border bg-card divide-border divide-y rounded-lg border border-dashed">
          {day.repeats.map((item) => (
            <li key={item.id}>
              <Link
                href={`/items/${item.id}`}
                className="hover:bg-muted text-muted-foreground flex items-center gap-2 px-3 py-2 text-sm transition-colors"
              >
                <Repeat aria-hidden className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.recurrence ? (
                  <span className="shrink-0 text-xs">{summarizeRecurrence(item.recurrence)}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {day.expiring.length > 0 ? <UseSoonStrip items={day.expiring} today={today} /> : null}
    </section>
  );
}

/** Tomorrow is worth naming; after that the weekday is what people plan by. */
function relativeDayName(date: IsoDate, today: IsoDate): string {
  return daysBetween(today, date) === 1 ? "Tomorrow" : weekdayName(date);
}
