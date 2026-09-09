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
          {snapshot.asOf ? ` · imported ${snapshot.asOf.slice(0, 10)}` : ""}. Open the original for
          current information or edits. Live balances, inventories and task status belong to their
          canonical sources.
        </p>
      </header>
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
          title="No matching knowledge"
          description="Try another phrase, or connect a dated Second Brain snapshot on your server."
        />
      ) : (
        snapshot.entries.map((entry) => (
          <article key={entry.id} className="border-border space-y-3 rounded-xl border p-5">
            <h2 className="text-lg font-medium">{entry.title}</h2>
            <p className="text-muted-foreground text-xs">
              {entry.sensitivity} · {entry.freshness} · reviewed {entry.lastReviewed ?? "unknown"} ·
              source edited {entry.sourceEditedAt.slice(0, 10)}
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
      {workBoard.entries.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Shared Work Board</h2>
          <p className="text-muted-foreground text-sm">
            Notion snapshot · {workBoard.asOf?.slice(0, 10)}. Open the canonical task to check
            current status or edit.
          </p>
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
      )}
    </div>
  );
}
