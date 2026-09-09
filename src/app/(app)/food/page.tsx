import { getDb } from "@/server/db/client";
import { getConsumptionHistory } from "@/server/consumption/consumption-service";
import { EntryControls } from "@/components/consumption/entry-controls";
export const dynamic = "force-dynamic";
export default async function FoodPage() {
  const history = await getConsumptionHistory(getDb());
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Food & drink</h1>
        <p>
          Capture <strong>food: breakfast burrito</strong> or <strong>drink: iced coffee</strong> in
          the box above. Describe portions or the place if useful.
        </p>
        <p className="text-muted-foreground text-sm">
          Logs record what you report. Pantry stock and nutrition are not inferred.
        </p>
      </header>
      <section aria-label="Today's consumption" className="rounded-xl border p-4">
        <h2 className="font-medium">Logged today · {history.today.day}</h2>
        <p>
          {history.today.food} food entries · {history.today.drink} drink entries
        </p>
        <p className="text-muted-foreground text-xs">Day boundary: {history.today.timeZone}</p>
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-medium">Your feedback</h2>
        <p className="text-muted-foreground text-sm">
          Explicit feedback from the latest 100 logs. Matching descriptions are grouped; eating
          something alone is not a preference.
        </p>
        {history.feedback.length === 0 ? (
          <p>No feedback recorded yet.</p>
        ) : (
          history.feedback.map((entry, index) => (
            <p key={index}>
              {entry.description}: {entry.likes} likes · {entry.dislikes} dislikes
            </p>
          ))
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-medium">Recent logs</h2>
        {history.entries.length === 0 ? (
          <p>No food or drinks logged yet.</p>
        ) : (
          history.entries.map((entry) => (
            <article key={entry.id} className="grid gap-2 rounded-xl border p-4">
              <h3 className="font-medium">{entry.description}</h3>
              <p className="text-muted-foreground text-sm">
                {entry.kind} · {entry.loggedOn}
                {entry.voidedAt ? " · Removed (not counted)" : ""}
              </p>
              <EntryControls
                id={entry.id}
                feedback={entry.feedback}
                removed={entry.voidedAt !== null}
              />
            </article>
          ))
        )}
      </section>
    </div>
  );
}
