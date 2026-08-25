import type { Metadata } from "next";
import Link from "next/link";
import { AgendaDaySection } from "@/components/agenda/agenda-day";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { AGENDA_WINDOW_DAYS } from "@/domain/agenda/agenda";
import { formatMonthDay } from "@/domain/shared/date";
import { getAgendaData } from "@/server/agenda/agenda-service";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Upcoming" };

/**
 * The next fortnight, a day at a time.
 *
 * Today answers "what needs me now"; this answers "what is coming", and the two
 * do not overlap — it starts tomorrow on purpose. It is deliberately not a
 * calendar: there is no grid, no month, no empty Wednesday taking up space, and
 * nothing here has a time of day, because nothing in TylerOS does.
 *
 * Three sources appear on a day and each keeps its own shape: work that is due,
 * repeats that will come round, and food that will go off. See ADR 023.
 */
export default async function UpcomingPage() {
  const { today, agenda } = await getAgendaData(getDb());

  return (
    <>
      <PageHeader
        title="Upcoming"
        description={`${formatMonthDay(agenda.from)} to ${formatMonthDay(agenda.to)}`}
      />

      {agenda.totalSurfaced === 0 ? (
        <EmptyState
          title={`Nothing in the next ${AGENDA_WINDOW_DAYS} days`}
          description="No work is due, nothing repeats, and nothing in the kitchen is about to go off. Today has whatever is left."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/">Back to Today</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6">
          {agenda.days.map((day) => (
            <AgendaDaySection key={day.date} day={day} today={today} />
          ))}
        </div>
      )}
    </>
  );
}
