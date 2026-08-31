import { describe, expect, it } from "vitest";
import {
  buildSearchGroups,
  highlightMatch,
  matchTierFor,
  normalizeSearchText,
  rankHits,
} from "@/domain/search/search-ranking";
import type { SearchDomain, SearchHit } from "@/domain/search/search-result";
import { MATCH_TIERS, SEARCH_DOMAINS } from "@/domain/search/search-result";

/**
 * The ordering a person stares at every day, pinned down with no database.
 *
 * Ranking is the part of search most likely to be quietly "improved" into
 * something nobody can explain, so these assert the reasons rather than the
 * numbers: an exact name beats a prefix, a prefix beats a word inside, and two
 * results that tie still have exactly one correct order.
 */

function hit(overrides: Partial<SearchHit> & Pick<SearchHit, "id" | "title">): SearchHit {
  return {
    domain: "item",
    context: null,
    href: `/items/${overrides.id}`,
    tier: "secondary",
    ...overrides,
  };
}

function byDomain(groups: Partial<Record<SearchDomain, readonly SearchHit[]>>) {
  return {
    item: groups.item ?? [],
    note: groups.note ?? [],
    project: groups.project ?? [],
    kitchen: groups.kitchen ?? [],
  };
}

describe("normalizeSearchText", () => {
  it("ignores case", () => {
    expect(normalizeSearchText("Chicken Breast")).toBe("chicken breast");
  });

  it("treats punctuation as a word break rather than deleting it", () => {
    // "chickenbreast" would be a different word, and would stop the query
    // "breast" ever matching it.
    expect(normalizeSearchText("chicken-breast")).toBe("chicken breast");
  });

  it("strips accents so a query typed without them still matches", () => {
    expect(normalizeSearchText("Crème Fraîche")).toBe("creme fraiche");
  });

  it("collapses surrounding whitespace", () => {
    expect(normalizeSearchText("  rice  ")).toBe("rice");
  });

  it("reduces a string of pure punctuation to nothing", () => {
    expect(normalizeSearchText("%%%")).toBe("");
  });
});

describe("matchTierFor", () => {
  it("ranks a whole-title match highest", () => {
    expect(matchTierFor("chicken", "Chicken")).toBe("exact");
  });

  it("ignores case and punctuation when deciding an exact match", () => {
    expect(matchTierFor("creme fraiche", "Crème Fraîche")).toBe("exact");
  });

  it("ranks a title that starts with the query below an exact one", () => {
    expect(matchTierFor("chicken", "Chicken breast")).toBe("prefix");
  });

  it("treats a partly-typed first word as a prefix", () => {
    // Somebody typing "mon" has not finished the word, and the title still
    // starts with what they typed.
    expect(matchTierFor("mon", "monitor arm")).toBe("prefix");
  });

  it("ranks a word inside the title below a prefix", () => {
    expect(matchTierFor("arm", "monitor arm")).toBe("word");
  });

  it("does not promote a match that starts mid-word", () => {
    // "alarm" contains "arm", but nobody typing "arm" meant the end of a word.
    expect(matchTierFor("arm", "set an alarm")).toBe("secondary");
  });

  it("falls to the bottom tier when the title does not match at all", () => {
    // The domain matched this on its notes; the title has no opinion.
    expect(matchTierFor("clamp", "monitor arm")).toBe("secondary");
  });

  it("gives an empty query the bottom tier rather than matching everything", () => {
    expect(matchTierFor("", "monitor arm")).toBe("secondary");
    expect(matchTierFor("   ", "monitor arm")).toBe("secondary");
  });
});

describe("rankHits", () => {
  it("orders by tier before anything else", () => {
    const ranked = rankHits([
      hit({ id: "a", title: "Zucchini soup", tier: "secondary" }),
      hit({ id: "b", title: "Apple", tier: "exact" }),
      hit({ id: "c", title: "Mango", tier: "word" }),
    ]);

    expect(ranked.map((result) => result.id)).toEqual(["b", "c", "a"]);
  });

  it("orders equal tiers alphabetically by title", () => {
    const ranked = rankHits([
      hit({ id: "a", title: "Bananas", tier: "word" }),
      hit({ id: "b", title: "Apples", tier: "word" }),
    ]);

    expect(ranked.map((result) => result.title)).toEqual(["Apples", "Bananas"]);
  });

  it("breaks a full tie on id, so the order can never vary between runs", () => {
    // Two chicken packages with different dates are two truthful records with
    // the same name - ADR 019 - so this tie is real, not hypothetical.
    const ranked = rankHits([
      hit({ id: "22222222", title: "Chicken breast", tier: "exact" }),
      hit({ id: "11111111", title: "Chicken breast", tier: "exact" }),
    ]);

    expect(ranked.map((result) => result.id)).toEqual(["11111111", "22222222"]);
  });

  it("sorts a copy rather than the caller's array", () => {
    const input = [
      hit({ id: "a", title: "Zebra", tier: "secondary" }),
      hit({ id: "b", title: "Apple", tier: "exact" }),
    ];

    rankHits(input);
    expect(input.map((result) => result.id)).toEqual(["a", "b"]);
  });

  it("returns an empty list unchanged", () => {
    expect(rankHits([])).toEqual([]);
  });
});

describe("buildSearchGroups", () => {
  it("leads with the domain holding the best match", () => {
    // "chicken" is a whole food name and only a word inside an item title.
    const groups = buildSearchGroups(
      byDomain({
        item: [hit({ id: "i1", title: "Make chicken before game", tier: "word" })],
        kitchen: [
          hit({
            id: "k1",
            domain: "kitchen",
            title: "Chicken",
            tier: "exact",
            href: "/kitchen/k1",
          }),
        ],
      }),
    );

    expect(groups.map((group) => group.domain)).toEqual(["kitchen", "item"]);
  });

  it("falls back to a fixed domain order when two domains match equally well", () => {
    const groups = buildSearchGroups(
      byDomain({
        item: [hit({ id: "i1", title: "Desk setup", tier: "exact" })],
        project: [
          hit({
            id: "p1",
            domain: "project",
            title: "Desk setup",
            tier: "exact",
            href: "/projects/p1",
          }),
        ],
      }),
    );

    // Deliberately stable: two equally good queries should not reshuffle the page.
    expect(groups.map((group) => group.domain)).toEqual(["item", "project"]);
    expect(SEARCH_DOMAINS.indexOf("item")).toBeLessThan(SEARCH_DOMAINS.indexOf("project"));
  });

  it("leaves out a domain that matched nothing", () => {
    const groups = buildSearchGroups(byDomain({ item: [hit({ id: "i1", title: "Only this" })] }));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.domain).toBe("item");
  });

  it("returns nothing at all when no domain matched", () => {
    expect(buildSearchGroups(byDomain({}))).toEqual([]);
  });

  it("ranks the hits inside each group", () => {
    const groups = buildSearchGroups(
      byDomain({
        item: [
          hit({ id: "a", title: "Later", tier: "secondary" }),
          hit({ id: "b", title: "First", tier: "exact" }),
        ],
      }),
    );

    expect(groups[0]?.hits.map((result) => result.id)).toEqual(["b", "a"]);
  });

  it("labels every group", () => {
    const groups = buildSearchGroups(
      byDomain({
        kitchen: [
          hit({ id: "k1", domain: "kitchen", title: "Rice", href: "/kitchen/k1", tier: "exact" }),
        ],
      }),
    );

    expect(groups[0]?.label).toBe("Kitchen");
  });

  it("keeps identical text in two domains as two separate results", () => {
    // The same words really can be a project and a packet of food. Neither is
    // a duplicate of the other and neither may swallow the other.
    const groups = buildSearchGroups(
      byDomain({
        project: [
          hit({
            id: "p1",
            domain: "project",
            title: "Chicken",
            href: "/projects/p1",
            tier: "exact",
          }),
        ],
        kitchen: [
          hit({
            id: "k1",
            domain: "kitchen",
            title: "Chicken",
            href: "/kitchen/k1",
            tier: "exact",
          }),
        ],
      }),
    );

    expect(groups).toHaveLength(2);
    expect(groups.flatMap((group) => group.hits).map((result) => result.href)).toEqual([
      "/projects/p1",
      "/kitchen/k1",
    ]);
  });
});

describe("MATCH_TIERS", () => {
  it("orders the tiers from best to worst", () => {
    expect(MATCH_TIERS.exact).toBeGreaterThan(MATCH_TIERS.prefix);
    expect(MATCH_TIERS.prefix).toBeGreaterThan(MATCH_TIERS.word);
    expect(MATCH_TIERS.word).toBeGreaterThan(MATCH_TIERS.secondary);
  });
});

describe("highlightMatch", () => {
  it("splits a label around the matched text", () => {
    expect(highlightMatch("Chicken breast", "breast")).toEqual({
      before: "Chicken ",
      match: "breast",
      after: "",
    });
  });

  it("returns the label's own casing, not the query's", () => {
    expect(highlightMatch("Chicken breast", "CHICKEN").match).toBe("Chicken");
  });

  it("marks only the first occurrence", () => {
    expect(highlightMatch("rice with rice", "rice")).toEqual({
      before: "",
      match: "rice",
      after: " with rice",
    });
  });

  it("matches across punctuation the query omitted", () => {
    expect(highlightMatch("chicken-breast", "chicken breast").match).toBe("chicken-breast");
  });

  it("highlights nothing when the query is not in the label", () => {
    expect(highlightMatch("monitor arm", "clamp")).toEqual({
      before: "monitor arm",
      match: "",
      after: "",
    });
  });

  it("highlights nothing for an empty query", () => {
    expect(highlightMatch("monitor arm", "  ")).toEqual({
      before: "monitor arm",
      match: "",
      after: "",
    });
  });

  it("highlights an accented label from a query typed without accents", () => {
    // Decomposing and then dropping the combining mark leaves the length
    // unchanged, so the offset still lands on the right character and the
    // label keeps its accents.
    expect(highlightMatch("Crème fraîche", "creme")).toEqual({
      before: "",
      match: "Crème",
      after: " fraîche",
    });
  });

  it("declines to guess when normalising changes the label's length", () => {
    // A run of punctuation collapses to one space, so every offset after it
    // is shifted and would slice the original in the wrong place. Showing no
    // highlight beats showing a wrong one.
    expect(highlightMatch("chicken -- breast", "breast")).toEqual({
      before: "chicken -- breast",
      match: "",
      after: "",
    });
  });

  it("always reassembles into the original label", () => {
    for (const query of ["chicken", "breast", "nope", ""]) {
      const { before, match, after } = highlightMatch("Chicken breast", query);
      expect(before + match + after).toBe("Chicken breast");
    }
  });
});
