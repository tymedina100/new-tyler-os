import { readKnowledge } from "@/server/knowledge/knowledge-service";
import { palatePreferences } from "@/domain/knowledge/knowledge";
import { NoteMarkdown } from "@/components/notes/note-markdown";
import { getDb } from "@/server/db/client";
import { getConsumptionHistory } from "@/server/consumption/consumption-service";
import { EntryControls } from "@/components/consumption/entry-controls";
export const dynamic = "force-dynamic";
export default async function FoodPage() {
  const [history, knowledge] = await Promise.all([getConsumptionHistory(getDb()), readKnowledge()]);
  const preferences = palatePreferences(knowledge.entries);
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
      <section aria-label="Palate preferences" className="grid gap-3 rounded-xl border p-4">
        <h2 className="text-lg font-medium">Your taste profile</h2>
        <p className="text-muted-foreground text-sm">
          Canonical preferences from your saved Second Brain. Meal feedback below remains separate
          evidence.
        </p>
        {preferences.length ? (
          preferences.map((entry) => (
            <div key={entry.id} className="grid gap-2">
              <h3 className="font-medium">{entry.title}</h3>
              <details>
                <summary>Read saved preferences</summary>
                <NoteMarkdown body={entry.body} />
              </details>
              <p className="text-muted-foreground text-xs">
                {entry.sourceHealth.importMessage}. {entry.sourceHealth.reviewMessage}
              </p>
              <a
                href={entry.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                Open canonical preferences ↗
              </a>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">
            {knowledge.health.status === "available"
              ? "No active Palate preference record is present in this import."
              : knowledge.health.message}
          </p>
        )}
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
