import { buildSearchGroups } from "@/domain/search/search-ranking";
import type { SearchResults } from "@/domain/search/search-result";
import { EMPTY_SEARCH_RESULTS, SEARCH_LIMITS } from "@/domain/search/search-result";
import { itemHit, kitchenHit, noteHit, projectHit } from "@/domain/search/search-sources";
import { todayIsoDate } from "@/domain/shared/date";
import type { Database } from "@/server/db/client";
import { searchItems } from "@/server/items/item-repository";
import { searchInventory } from "@/server/kitchen/inventory-repository";
import { searchNotes } from "@/server/notes/note-repository";
import { searchProjects } from "@/server/projects/project-repository";

/**
 * Universal retrieval: one question asked of every domain that holds an answer.
 *
 * Its own service rather than a method on any one domain, for the same reason
 * `agenda-service.ts` is its own: it belongs to none of them. It reads from the
 * item, note, project and kitchen repositories and hands all four to a pure
 * projection. Putting it in `item-service` would make the item spine
 * responsible for knowing what is in the fridge, which is exactly the coupling
 * ADR 019 kept out of the schema and ADR 023 kept out of the agenda.
 *
 * **Each domain still owns how it is searched.** Items and notes match a
 * generated `tsvector` with an `ILIKE` fallback (ADR 009) — both are prose;
 * the kitchen and projects match substrings, because short names and
 * half-remembered words are what those tables actually hold. There is no
 * shared query and no universal table. Notes (0.8) is the fourth domain ADR
 * 028 described joining: a query in its own repository and a mapping in
 * `src/domain/search/search-sources.ts`, with no change to
 * `search-ranking.ts` — its tier logic already operated on any
 * `(query, title)` pair, so a note found only through its body correctly
 * lands in `secondary` with no note-specific code at all.
 *
 * Nothing AI-shaped is involved. The query is never sent anywhere, and pending
 * `item_suggestions` are not searched: a proposal nobody has accepted is not
 * something the user put into TylerOS, so finding it again would be finding
 * something they never filed. Search works identically with AI switched off,
 * which is how this repository ships.
 */

export async function searchEverything(
  db: Database,
  rawQuery: string,
  now = new Date(),
): Promise<SearchResults> {
  const query = rawQuery.trim();

  // Asking every table for everything they have is not a search, it is a
  // table scan with a heading on it.
  if (query.length === 0) return EMPTY_SEARCH_RESULTS;

  const today = todayIsoDate(now);

  // Concurrent because they are genuinely independent: no domain's query needs
  // another's answer, so paying for them in sequence would buy nothing.
  const [items, notes, projects, food] = await Promise.all([
    searchItems(db, query, SEARCH_LIMITS.item),
    searchNotes(db, query, SEARCH_LIMITS.note),
    searchProjects(db, query, SEARCH_LIMITS.project),
    searchInventory(db, query, SEARCH_LIMITS.kitchen),
  ]);

  const groups = buildSearchGroups({
    item: items.map((item) => itemHit(item, today, query)),
    note: notes.map((note) => noteHit(note, query)),
    project: projects.map((project) => projectHit(project, query)),
    kitchen: food.map((entry) => kitchenHit(entry, today, query)),
  });

  return {
    query,
    groups,
    total: groups.reduce((sum, group) => sum + group.hits.length, 0),
  };
}
