/**
 * What a cross-domain search result is.
 *
 * TylerOS now holds three genuinely different kinds of thing worth finding: a
 * captured intention, a project that groups them, and a packet of chicken in
 * the freezer. Retrieval has to reach all three, and the temptation is to make
 * them one thing — a universal `entities` table, or a `Searchable` interface
 * every domain implements. Both were rejected for the reason ADR 023 rejected
 * an events table: they would make the fridge a to-do list.
 *
 * So this is a **projection, not a model**. Nothing here is persisted and
 * nothing owns its source. A `SearchHit` is what one record looks like *in a
 * list of results* — the least that is needed to recognise it and go to it —
 * and the record itself keeps its own type, its own table and its own page.
 *
 * The fields are deliberately few. There is no metadata bag: three domains
 * agreeing on five fields is a seam, and the moment a fourth needs a sixth
 * field it should say so in its own words rather than through a `Record`.
 */

/** The domains that participate in search, in the order ties are broken. */
export const SEARCH_DOMAINS = ["item", "note", "project", "kitchen", "consumption"] as const;
export type SearchDomain = (typeof SEARCH_DOMAINS)[number];

export const SEARCH_DOMAIN_LABELS: Record<SearchDomain, string> = {
  item: "Items",
  note: "Notes",
  project: "Projects",
  kitchen: "Kitchen",
  consumption: "Food & drink history",
};

/**
 * How well a record matched, as a small closed set rather than a number.
 *
 * Tiers instead of a score because the ordering has to be explainable and
 * testable. "Chicken breast" beats "for the chicken curry" because an exact
 * name match outranks a note mentioning it — not because one scored 0.31 and
 * the other 0.14. Higher is better; the values are ordinals, never arithmetic.
 */
export const MATCH_TIERS = {
  /** The whole title or name is the query, ignoring case and punctuation. */
  exact: 4,
  /** The title or name starts with the query. */
  prefix: 3,
  /** Some word inside the title or name starts with the query. */
  word: 2,
  /** Matched somewhere else: notes, a description, a full-text stem. */
  secondary: 1,
} as const;

export type MatchTier = keyof typeof MATCH_TIERS;

/**
 * One result, in a list of results.
 *
 * `context` is the one line under the title that tells two similar results
 * apart — "Freezer · 2 lb", "Task · Meal Prep". It is not a summary and not a
 * second row of controls: a search result exists to be recognised and clicked,
 * and anything more belongs on the page it links to.
 */
export interface SearchHit {
  domain: SearchDomain;
  /** The record's own id, stable and unique within its domain. */
  id: string;
  /** The primary label: an item's title, a project's name, a food's name. */
  title: string;
  /** One line of identifying detail, or null when the title says it all. */
  context: string | null;
  /** The canonical existing page for this record. Search owns no pages. */
  href: string;
  tier: MatchTier;
}

/** One domain's results, kept separate so the reader always knows what they are looking at. */
export interface SearchGroup {
  domain: SearchDomain;
  label: string;
  hits: SearchHit[];
}

export interface SearchResults {
  /** The query as the user typed it, trimmed. Empty means nothing was asked. */
  query: string;
  /** Only domains that matched something, best-matching domain first. */
  groups: SearchGroup[];
  total: number;
}

export const EMPTY_SEARCH_RESULTS: SearchResults = { query: "", groups: [], total: 0 };

/**
 * How many results one domain may contribute.
 *
 * Per domain rather than overall, so a hundred matching items cannot push the
 * one matching project off the page — which is the whole point of grouping.
 * These are display caps on a single-user database, not pagination: needing a
 * fifty-first item means the query was too vague, and the answer is a better
 * query rather than an infinite scroll.
 */
export const SEARCH_LIMITS: Record<SearchDomain, number> = {
  item: 50,
  note: 50,
  project: 20,
  kitchen: 20,
  consumption: 20,
};
