import type {
  MatchTier,
  SearchDomain,
  SearchGroup,
  SearchHit,
} from "@/domain/search/search-result";
import { MATCH_TIERS, SEARCH_DOMAIN_LABELS, SEARCH_DOMAINS } from "@/domain/search/search-result";

/**
 * Deterministic ranking.
 *
 * Every domain already decides *what* matches in its own SQL — full text for
 * items, substrings for short kitchen names. This decides *how well*, using one
 * rule for all three so that "chicken" behaves the same way whichever domain it
 * lands in. The database is asked to find; this is asked to order.
 *
 * It is pure, and every input is an argument, so the ordering that a person
 * will stare at every day is pinned down by tests that run in milliseconds.
 *
 * Ranking happens **inside** a group, never across one. `ts_rank` on an item
 * and a substring position in a food name are not the same quantity and
 * comparing them would be inventing a number. Grouping is what makes that
 * comparison unnecessary rather than merely unwise.
 */

/**
 * Case, accents and punctuation are noise when recalling something.
 *
 * "Chicken Breast", "chicken breast" and "chicken-breast" are one thing to the
 * person who typed any of them. Punctuation collapses to a space rather than
 * vanishing, so "chicken-breast" stays two words instead of becoming one.
 */
export function normalizeSearchText(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

/**
 * How well a query matched one record.
 *
 * `primary` is the title or name — the thing the user is actually trying to
 * remember. Everything else a domain searches (an item's body, a project's
 * description, a note on a jar) shares the bottom tier: a record only reaches
 * this function because its own domain already matched it, so "the title does
 * not contain this" is the floor rather than a failure, and there is nothing to
 * be gained by ranking a description match above a notes match.
 */
export function matchTierFor(query: string, primary: string): MatchTier {
  const needle = normalizeSearchText(query);
  const haystack = normalizeSearchText(primary);

  if (needle.length === 0) return "secondary";
  if (haystack === needle) return "exact";
  if (haystack.startsWith(needle)) return "prefix";

  // A word-boundary prefix, not a bare substring: "arm" should promote "monitor
  // arm", while "alarm" keeps the tier its domain's own match earned it. People
  // recall the starts of words, not the middles.
  if (haystack.includes(` ${needle}`)) return "word";

  return "secondary";
}

/**
 * Sorts one domain's hits into the order they will be read in.
 *
 * Tier first, then the title alphabetically, then the id. The last of those is
 * never what anybody wants to sort by and is the reason this is safe to test:
 * two records with the same tier and the same title still have exactly one
 * correct order, so the assertion cannot pass on one machine and fail on
 * another. Sorting a copy, because a caller's array is not this function's.
 */
export function rankHits(hits: readonly SearchHit[]): SearchHit[] {
  return [...hits].sort(compareHits);
}

function compareHits(a: SearchHit, b: SearchHit): number {
  const byTier = MATCH_TIERS[b.tier] - MATCH_TIERS[a.tier];
  if (byTier !== 0) return byTier;

  const byTitle = normalizeSearchText(a.title).localeCompare(normalizeSearchText(b.title), "en");
  if (byTitle !== 0) return byTitle;

  return a.id.localeCompare(b.id);
}

/**
 * Groups, best-matching domain first.
 *
 * Searching "chicken" should lead with the freezer and searching "monitor" with
 * the items, so the order follows each domain's strongest hit rather than a
 * fixed list. Where two domains match equally well the fixed order in
 * `SEARCH_DOMAINS` breaks the tie, which keeps the page from reshuffling
 * between two queries that are equally good.
 *
 * Empty groups are dropped entirely. A heading over nothing is a result that
 * has to be read before it can be discarded.
 */
export function buildSearchGroups(
  hitsByDomain: Readonly<Record<SearchDomain, readonly SearchHit[]>>,
): SearchGroup[] {
  return SEARCH_DOMAINS.map((domain) => ({
    domain,
    label: SEARCH_DOMAIN_LABELS[domain],
    hits: rankHits(hitsByDomain[domain]),
  }))
    .filter((group) => group.hits.length > 0)
    .sort(compareGroups);
}

function compareGroups(a: SearchGroup, b: SearchGroup): number {
  const byBestTier = MATCH_TIERS[bestTier(b)] - MATCH_TIERS[bestTier(a)];
  if (byBestTier !== 0) return byBestTier;

  return SEARCH_DOMAINS.indexOf(a.domain) - SEARCH_DOMAINS.indexOf(b.domain);
}

/** Hits are already ranked when this runs, so the best one is the first one. */
function bestTier(group: SearchGroup): MatchTier {
  return group.hits[0]?.tier ?? "secondary";
}

/**
 * Where the query appears in a label, as three plain strings.
 *
 * Returned as text for React to render, never as HTML: highlighting is
 * decoration, and decoration is not worth a `dangerouslySetInnerHTML` on a page
 * that renders personal notes. Only the first occurrence is marked — a second
 * highlight on the same line adds nothing to recognising the row.
 *
 * The search is done on normalised text but the offsets are applied to the
 * original, so the label is returned exactly as it was stored, accents and
 * capitals intact. That only holds while normalisation preserves length, which
 * is why it maps characters to spaces rather than deleting them.
 */
export interface HighlightSegments {
  before: string;
  match: string;
  after: string;
}

export function highlightMatch(label: string, query: string): HighlightSegments {
  const needle = normalizeSearchText(query);
  const none: HighlightSegments = { before: label, match: "", after: "" };

  if (needle.length === 0) return none;

  // NFKD can change length, so a decomposable label falls back to no highlight
  // rather than slicing the original at an offset that means something else.
  const haystack = normalizeSearchText(label);
  if (haystack.length !== label.length) return none;

  const at = haystack.indexOf(needle);
  if (at === -1) return none;

  return {
    before: label.slice(0, at),
    match: label.slice(at, at + needle.length),
    after: label.slice(at + needle.length),
  };
}
