import { Search } from "lucide-react";
import type { Metadata } from "next";
import { ItemFilterBar } from "@/components/items/item-filter-bar";
import { ItemList } from "@/components/items/item-list";
import { SEARCH_INPUT_ID, SearchResultList } from "@/components/search/search-results";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import {
  kindsForFilter,
  parseKindFilter,
  parseStatusFilter,
  statusesForFilter,
} from "@/domain/items/item-filters";
import { todayIsoDate } from "@/domain/shared/date";
import { readParam } from "@/lib/search-params";
import { getDb } from "@/server/db/client";
import { listItemsForView } from "@/server/items/item-service";
import { listProjectsWithProgress } from "@/server/projects/project-service";
import { searchEverything } from "@/server/search/search-service";

export const metadata: Metadata = { title: "Search" };

/**
 * Universal retrieval — the one surface that reaches everything TylerOS holds.
 *
 * If something was put in here, it has to be findable again, whichever domain
 * ended up owning it. So a query asks the items, the projects and the kitchen
 * at once and shows the answers grouped by where they came from. Nothing is
 * converted into anything else to make it fit: a packet of chicken is shown as
 * a packet of chicken, and opening it goes to the kitchen record. See ADR 028.
 *
 * The page has two modes, and they are two modes rather than one because they
 * answer two different questions:
 *
 *   - **A query** — "where did I put that?" — searches every domain.
 *   - **Filters alone** — "show me everything tagged #home" — browses items,
 *     which is the only domain that has kinds, statuses and tags to filter by.
 *     Every tag chip in the app links here, so this path predates the milestone
 *     and is deliberately left as it was.
 *
 * The form is a plain GET form. Search therefore works with JavaScript off,
 * every result set is a URL worth keeping, and Back and Forward do the right
 * thing without a single line of history handling. A debounced live search
 * would need a fetch layer, which this architecture does not have and does not
 * want — see ADR 006.
 */
export default async function SearchPage(props: PageProps<"/search">) {
  const params = await props.searchParams;
  const db = getDb();

  const search = readParam(params.q);
  const kind = parseKindFilter(readParam(params.kind), "all");
  const status = parseStatusFilter(readParam(params.status), "all");
  const projectId = readParam(params.projectId);
  const tagName = readParam(params.tag);

  const hasFilters = Boolean(
    projectId ??
    tagName ??
    (kind !== "all" ? kind : undefined) ??
    (status !== "all" ? status : undefined),
  );

  const [results, filtered, projects] = await Promise.all([
    search ? searchEverything(db, search) : null,
    // Only loaded for the filter-browse mode. A query answers with every
    // domain, and running an item-only list beside it would be a query nobody
    // reads.
    !search && hasFilters
      ? listItemsForView(db, {
          kinds: kindsForFilter(kind),
          statuses: statusesForFilter(status),
          projectId,
          tagName,
        })
      : null,
    listProjectsWithProgress(db),
  ]);

  const total = results?.total ?? filtered?.length ?? 0;
  const today = todayIsoDate(new Date());

  return (
    <>
      <PageHeader
        title="Search"
        description={
          results || filtered ? `${total} ${total === 1 ? "result" : "results"}` : undefined
        }
      />

      <form
        action="/search"
        role="search"
        className="border-border bg-card focus-within:border-ring mb-3 flex items-center gap-2 rounded-lg border px-3"
      >
        <Search aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <input
          id={SEARCH_INPUT_ID}
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Search everything you have captured…"
          aria-label="Search"
          autoComplete="off"
          className="placeholder:text-muted-foreground h-10 w-full min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {tagName ? <input type="hidden" name="tag" value={tagName} /> : null}
        {kind !== "all" ? <input type="hidden" name="kind" value={kind} /> : null}
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      </form>

      {/* Kinds, statuses and tags belong to items alone, so the filters only
          appear where they mean something: browsing, not searching. */}
      {!search ? <ItemFilterBar projects={projects} defaultStatus="all" /> : null}

      {results ? <QueryResults results={results} /> : null}

      {filtered ? (
        filtered.length === 0 ? (
          <EmptyState
            title="Nothing matches"
            description="No items fit these filters. Widen them, or search for a word instead."
          />
        ) : (
          <ItemList items={filtered} today={today} />
        )
      ) : null}

      {!results && !filtered ? (
        <EmptyState
          title="Search everything"
          description="Items, projects and the kitchen, all at once. A half-remembered word is usually enough — press Down to walk the results from the keyboard."
        />
      ) : null}
    </>
  );
}

function QueryResults({ results }: { results: Awaited<ReturnType<typeof searchEverything>> }) {
  if (results.total === 0) {
    return (
      <EmptyState
        title="Nothing matched"
        description={`Nothing in your items, projects or kitchen mentions “${results.query}”. Try a shorter word, or a different one.`}
      />
    );
  }

  return <SearchResultList results={results} />;
}
