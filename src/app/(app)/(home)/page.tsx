import { getConsumptionSummary } from "@/server/consumption/consumption-service";
import Link from "next/link";
import { ItemList } from "@/components/items/item-list";
import { ItemSection } from "@/components/items/item-section";
import { UseSoonStrip } from "@/components/kitchen/use-soon-strip";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { formatLongDate } from "@/domain/shared/date";
import { UPCOMING_WINDOW_DAYS } from "@/domain/today/today-view";
import { getDb } from "@/server/db/client";
import { getTodayData } from "@/server/items/item-service";
import { getExpiringSoon } from "@/server/kitchen/inventory-service";
import { getOperationsSummary } from "@/server/runtime/operations-service";
import { operationsNeedAttention } from "@/domain/runtime/operations-summary";
import { OperationsStrip } from "@/components/runtime/operations-strip";

/**
 * Today answers one question: what actually needs me right now.
 *
 * It is not a summary of the system. Triaged work with no date does not appear,
 * because a screen that shows everything is a screen nobody reads.
 */
export default async function TodayPage() {
  const db = getDb();
  const now = new Date();
  const [{ today, view }, expiring, operations, consumption] = await Promise.all([
    getTodayData(db, now),
    getExpiringSoon(db, now),
    getOperationsSummary(db, now),
    getConsumptionSummary(db, now),
  ]);

  // Food about to be wasted is the only inventory Today shows, and it does not
  // stop the page being empty of work.
  const nothingToDo =
    view.totalSurfaced === 0 && expiring.items.length === 0 && !operationsNeedAttention(operations);

  return (
    <>
      <PageHeader title="Today" description={formatLongDate(today)} />
      <OperationsStrip summary={operations} />
      <Link href="/food" className="text-muted-foreground text-sm">
        Food & drink · {consumption.food} food entries, {consumption.drink} drink entries logged
        today
      </Link>

      {nothingToDo ? (
        <EmptyState
          title="Nothing needs you right now"
          description="No overdue work, nothing due today, and an empty inbox. Capture something above when it turns up."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/tasks">Browse everything</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6">
          {view.overdue.length > 0 ? (
            <ItemSection title="Overdue" count={view.overdue.length} tone="urgent">
              <ItemList items={view.overdue} today={today} />
            </ItemSection>
          ) : null}

          {view.dueToday.length > 0 ? (
            <ItemSection title="Due today" count={view.dueToday.length} tone="now">
              <ItemList items={view.dueToday} today={today} />
            </ItemSection>
          ) : null}

          {view.needsTriage.length > 0 ? (
            <ItemSection title="Needs triage" count={view.needsTriage.length}>
              <ItemList items={view.needsTriage} today={today} />
            </ItemSection>
          ) : null}

          {view.upcoming.length > 0 ? (
            <ItemSection title={`Next ${UPCOMING_WINDOW_DAYS} days`} count={view.upcoming.length}>
              <ItemList items={view.upcoming} today={today} />
            </ItemSection>
          ) : null}

          {expiring.items.length > 0 ? (
            <ItemSection title="Use soon" count={expiring.items.length}>
              <UseSoonStrip items={expiring.items} today={today} />
            </ItemSection>
          ) : null}
        </div>
      )}
    </>
  );
}
