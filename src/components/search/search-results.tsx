"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { highlightMatch } from "@/domain/search/search-ranking";
import type { SearchHit, SearchResults } from "@/domain/search/search-result";
import { ItemSection } from "@/components/items/item-section";

/**
 * Cross-domain results, grouped by where they came from.
 *
 * One row shape for every domain, deliberately. A result exists to be
 * recognised and opened, and a reader scanning a mixed list should not have to
 * re-learn the layout between "Items" and "Kitchen" — the heading says what
 * they are looking at, and the row below it always works the same way. Anything
 * richer belongs on the page the row links to, which is a page that already
 * exists.
 *
 * ## Keyboard
 *
 * The whole list is reachable without a mouse, and nothing is hijacked to do
 * it. Results are ordinary links, so the browser already handles Enter, and
 * Tab, and open-in-new-tab. All this adds is moving between them:
 *
 *   - Down from the query box focuses the first result
 *   - Up and Down move between results
 *   - Up from the first result, or Escape from any, returns to the query box
 *
 * No Enter handler and no Tab handler, because both already do the right thing
 * and taking them over is how a search box stops behaving like the rest of the
 * web. Focus **is** the selection — following the pattern
 * `src/components/items/inbox-triage.tsx` established — so a screen reader
 * announces each row as it is reached and scrolling comes free.
 */

export const SEARCH_INPUT_ID = "search-query";

export function SearchResultList({ results }: { results: SearchResults }) {
  const links = useRef(new Map<string, HTMLAnchorElement>());

  // A flat reading order across every group: the keyboard should walk the page
  // as it is drawn, not stop at a heading.
  const order = useMemo(
    () => results.groups.flatMap((group) => group.hits.map(keyOf)),
    [results.groups],
  );

  const focusInput = useCallback(() => {
    document.getElementById(SEARCH_INPUT_ID)?.focus();
  }, []);

  const focusAt = useCallback(
    (index: number) => {
      const key = order[index];
      if (key === undefined) return false;

      const link = links.current.get(key);
      if (!link) return false;

      link.focus();
      return true;
    },
    [order],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Escape") return;
      // Chords belong to the browser. Alt+Down and Cmd+Up are its own.
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (order.length === 0) return;

      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const inInput = target.id === SEARCH_INPUT_ID;
      const at = target.dataset.searchHit ? order.indexOf(target.dataset.searchHit) : -1;

      // Anywhere else on the page - an inventory quick-add, the capture bar -
      // the arrow keys are that control's, not this list's.
      if (!inInput && at === -1) return;

      if (event.key === "Escape") {
        if (inInput) return;
        event.preventDefault();
        focusInput();
        return;
      }

      if (inInput) {
        // Up in the query box is the browser's "jump to the start of the line".
        if (event.key === "ArrowUp") return;
        if (focusAt(0)) event.preventDefault();
        return;
      }

      if (event.key === "ArrowUp" && at === 0) {
        event.preventDefault();
        focusInput();
        return;
      }

      // Clamped, not wrapped: running off the end of a list should stop rather
      // than silently sending the reader back to results they already rejected.
      const next = Math.min(
        Math.max(at + (event.key === "ArrowDown" ? 1 : -1), 0),
        order.length - 1,
      );
      if (next !== at && focusAt(next)) event.preventDefault();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusAt, focusInput, order]);

  const register = useCallback((key: string, node: HTMLAnchorElement | null) => {
    if (node) links.current.set(key, node);
    else links.current.delete(key);
  }, []);

  return (
    <div className="grid gap-6">
      {results.groups.map((group) => (
        <ItemSection key={group.domain} title={group.label} count={group.hits.length}>
          <ul className="grid gap-2">
            {group.hits.map((hit) => (
              <SearchResultRow
                key={keyOf(hit)}
                hit={hit}
                query={results.query}
                register={register}
              />
            ))}
          </ul>
        </ItemSection>
      ))}
    </div>
  );
}

/** Ids are only unique within a domain, so the key has to carry both. */
function keyOf(hit: SearchHit): string {
  return `${hit.domain}:${hit.id}`;
}

function SearchResultRow({
  hit,
  query,
  register,
}: {
  hit: SearchHit;
  query: string;
  register: (key: string, node: HTMLAnchorElement | null) => void;
}) {
  const key = keyOf(hit);
  const { before, match, after } = highlightMatch(hit.title, query);

  return (
    <li className="border-border bg-card hover:border-input rounded-lg border transition-colors">
      <Link
        href={hit.href}
        ref={(node) => register(key, node)}
        data-search-hit={key}
        className="focus-visible:ring-ring block rounded-lg px-3 py-2.5 focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="block text-sm font-medium break-words">
          {before}
          {/* Plain text, never raw HTML: a highlight is decoration and is not
              worth an injection surface on a page rendering personal notes. */}
          {match ? <mark className="bg-transparent font-semibold underline">{match}</mark> : null}
          {after}
        </span>

        {hit.context ? (
          <span className="text-muted-foreground mt-1 block text-xs break-words">
            {hit.context}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
