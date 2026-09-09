import Link from "next/link";
import { readKnowledge } from "@/server/knowledge/knowledge-service";
import { NoteMarkdown } from "@/components/notes/note-markdown";
import { readWorkBoard } from "@/server/knowledge/work-board-service";
import { EmptyState } from "@/components/ui/states";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const [snapshot, workBoard] = await Promise.all([readKnowledge(query), readWorkBoard()]);
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">Your shared Second Brain</p>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
        <p className="text-muted-foreground text-sm">
          Source-linked Notion snapshot
          {snapshot.asOf ? ` · latest import batch ${snapshot.asOf.slice(0, 10)}` : ""}. Open the
          original for current information or edits. Live balances, inventories and task status
          belong to their canonical sources.
        </p>
      </header>
      <p role="status" className="text-muted-foreground text-sm">
        {snapshot.health.message}
      </p>
      <form className="flex gap-2">
        <input
          aria-label="Search personal knowledge"
          name="q"
          defaultValue={query}
          placeholder="Search preferences, routines, context…"
          className="border-input bg-background min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm">
          Search
        </button>
      </form>
      {snapshot.entries.length === 0 ? (
        <EmptyState
          title={
            snapshot.health.status === "available"
              ? "No matching knowledge"
              : "Personal knowledge unavailable"
          }
          description={
            snapshot.health.status === "available"
              ? "Try another phrase. Your shared Work Board is shown separately below."
              : snapshot.health.message
          }
        />
      ) : (
        snapshot.entries.map((entry) => (
          <article key={entry.id} className="border-border space-y-3 rounded-xl border p-5">
            <h2 className="text-lg font-medium">{entry.title}</h2>
            <p className="text-muted-foreground text-xs">
              {entry.sensitivity} · {entry.freshness} · reviewed {entry.lastReviewed ?? "unknown"} ·
              source edited {entry.sourceEditedAt.slice(0, 10)}
            </p>
            <p className="text-muted-foreground text-sm">
              {entry.sourceHealth.importMessage} · {entry.sourceHealth.reviewMessage}
            </p>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Read saved context</summary>
              <div className="mt-3">
                <NoteMarkdown body={entry.body} />
              </div>
            </details>
            <Link
              href={entry.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline underline-offset-4"
            >
              Open canonical Notion page ↗
            </Link>
          </article>
        ))
      )}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Shared Work Board</h2>
        <p className="text-muted-foreground text-sm">{workBoard.health.message}</p>
        {workBoard.health.status === "available" && workBoard.entries.length === 0 && (
          <p className="text-muted-foreground text-sm">No active tasks in the saved snapshot.</p>
        )}
        {workBoard.entries
          .filter(
            (entry) =>
              !query ||
              `${entry.title} ${entry.nextAction}`.toLowerCase().includes(query.toLowerCase()),
          )
          .map((entry) => (
            <article key={entry.id} className="border-border space-y-2 rounded-xl border p-4">
              <Link href={entry.sourceUrl} className="font-medium underline underline-offset-4">
                {entry.title} ↗
              </Link>
              <p className="text-muted-foreground text-xs">
                {entry.owner} · {entry.status} · source edited {entry.sourceEditedAt.slice(0, 10)}
              </p>
              <p className="text-sm">{entry.nextAction}</p>
            </article>
          ))}
      </section>
    </div>
  );
}
