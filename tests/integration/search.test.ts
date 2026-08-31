import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SearchDomain, SearchHit, SearchResults } from "@/domain/search/search-result";
import { SEARCH_LIMITS } from "@/domain/search/search-result";
import * as itemService from "@/server/items/item-service";
import * as kitchen from "@/server/kitchen/inventory-service";
import * as noteService from "@/server/notes/note-service";
import * as projectService from "@/server/projects/project-service";
import * as suggestions from "@/server/suggestions/suggestion-service";
import { searchEverything } from "@/server/search/search-service";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

/**
 * Universal search, against real SQL.
 *
 * The pure ranking rules are already pinned down in
 * `src/domain/search/search-ranking.test.ts` with no database. What only this
 * can prove is the part that lives in Postgres and in the composition above it:
 * that three separately-owned queries — a `tsvector`, and two different `ILIKE`
 * shapes — actually run together, come back as one ranked set of results, and
 * point at pages that exist.
 */

let harness: TestDatabase;

beforeAll(async () => {
  harness = await createTestDatabase();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

function db() {
  return harness.db;
}

/** A fixed date, so "Best by Friday" in a context line cannot drift. */
const NOW = new Date(2026, 7, 25);

function group(results: SearchResults, domain: SearchDomain): SearchHit[] {
  return results.groups.find((entry) => entry.domain === domain)?.hits ?? [];
}

function titles(results: SearchResults, domain: SearchDomain): string[] {
  return group(results, domain).map((hit) => hit.title);
}

async function food(
  name: string,
  overrides: Partial<Parameters<typeof kitchen.addInventoryItem>[1]> = {},
) {
  return kitchen.addInventoryItem(db(), {
    name,
    location: "pantry",
    quantity: null,
    unit: null,
    expiresOn: null,
    notes: null,
    ...overrides,
  });
}

async function project(name: string, description: string | null = null) {
  return projectService.createProject(db(), { name, description, status: "active" });
}

async function note(title: string, body = "placeholder") {
  const id = await noteService.captureNote(db(), { body: "placeholder", projectId: null });
  await noteService.updateNote(db(), { id, title, body, tags: [], projectId: null });
  return id;
}

describe("searching across every domain", () => {
  beforeEach(async () => {
    await food("Chicken breast", { location: "freezer", quantity: 2, unit: "lb" });
    await food("Chicken thighs", { location: "fridge" });
    await food("Rice", { location: "pantry" });

    // The description is what makes this project findable by "chicken" — the
    // name alone never mentions it, which is the point of searching both.
    const meals = await project("Meal Prep", "Batch cooking chicken on Sundays");
    await project("Desk Setup", "A monitor arm and a better chair");

    await itemService.captureItem(db(), { text: "Make chicken before game", projectId: meals });
    await itemService.captureItem(db(), { text: "Research monitor arms", projectId: null });
  });

  it("returns one shared term from all three domains at once", async () => {
    const results = await searchEverything(db(), "chicken", NOW);

    expect(titles(results, "kitchen")).toEqual(["Chicken breast", "Chicken thighs"]);
    expect(titles(results, "item")).toEqual(["Make chicken before game"]);
    expect(titles(results, "project")).toEqual(["Meal Prep"]);
  });

  it("counts every domain's results in the total", async () => {
    const results = await searchEverything(db(), "chicken", NOW);
    expect(results.total).toBe(4);
  });

  it("leads with the domain that matched best", async () => {
    // "Chicken breast" starts with the query; nothing else does.
    const results = await searchEverything(db(), "chicken", NOW);
    expect(results.groups[0]?.domain).toBe("kitchen");
  });

  it("leads with a different domain when that domain matches better", async () => {
    const results = await searchEverything(db(), "monitor", NOW);

    expect(results.groups[0]?.domain).toBe("item");
    expect(titles(results, "item")).toEqual(["Research monitor arms"]);
    expect(titles(results, "project")).toEqual(["Desk Setup"]);
  });

  it("leaves out a domain that matched nothing", async () => {
    const results = await searchEverything(db(), "monitor", NOW);
    expect(results.groups.map((entry) => entry.domain)).not.toContain("kitchen");
  });

  it("finds a project by its description alone", async () => {
    const results = await searchEverything(db(), "sundays", NOW);
    expect(titles(results, "project")).toEqual(["Meal Prep"]);
  });

  it("ranks a project matched on its name above one matched on its description", async () => {
    // "Desk Setup" is the name; "Meal Prep" only mentions batch cooking.
    await project("Batch Cooking");
    const results = await searchEverything(db(), "batch cooking", NOW);

    expect(titles(results, "project")[0]).toBe("Batch Cooking");
  });

  it("returns nothing for a term that appears nowhere", async () => {
    const results = await searchEverything(db(), "helicopter", NOW);

    expect(results.groups).toEqual([]);
    expect(results.total).toBe(0);
  });

  it("returns nothing for an empty query rather than everything", async () => {
    for (const query of ["", "   ", "\t\n"]) {
      const results = await searchEverything(db(), query, NOW);
      expect(results.total).toBe(0);
      expect(results.query).toBe("");
    }
  });

  it("keeps the trimmed query, so the page can quote what was asked", async () => {
    expect((await searchEverything(db(), "  chicken  ", NOW)).query).toBe("chicken");
  });

  it("is case-insensitive in every domain", async () => {
    const results = await searchEverything(db(), "CHICKEN", NOW);

    expect(titles(results, "kitchen")).toHaveLength(2);
    expect(titles(results, "item")).toHaveLength(1);
    expect(titles(results, "project")).toHaveLength(1);
  });

  it("treats punctuation as text rather than as query syntax", async () => {
    // `websearch_to_tsquery` has its own operators and `ILIKE` has wildcards.
    // Neither may reach the database as syntax.
    for (const query of ["100% cotton & wool", "chicken | rice", "50%", "_"]) {
      await expect(searchEverything(db(), query, NOW)).resolves.toMatchObject({
        total: expect.any(Number),
      });
    }
  });

  it("does not let a wildcard match everything", async () => {
    expect((await searchEverything(db(), "%", NOW)).total).toBe(0);
  });
});

describe("results the user can act on", () => {
  it("points every result at the canonical page for its own domain", async () => {
    const foodId = await food("Chicken breast", { location: "freezer" });
    const projectId = await project("Chicken");
    const itemId = await itemService.captureItem(db(), {
      text: "Defrost the chicken",
      projectId: null,
    });

    const results = await searchEverything(db(), "chicken", NOW);
    const hrefs = new Map(results.groups.flatMap((entry) => entry.hits).map((h) => [h.id, h.href]));

    expect(hrefs.get(foodId)).toBe(`/kitchen/${foodId}`);
    expect(hrefs.get(projectId)).toBe(`/projects/${projectId}`);
    expect(hrefs.get(itemId)).toBe(`/items/${itemId}`);
  });

  it("keeps identical text in three domains as three separate results", async () => {
    await food("Chicken");
    await project("Chicken");
    await itemService.captureItem(db(), { text: "Chicken", projectId: null });

    const results = await searchEverything(db(), "chicken", NOW);

    expect(results.total).toBe(3);
    expect(results.groups).toHaveLength(3);
    // Nothing was merged, and no domain swallowed another's record.
    expect(new Set(results.groups.flatMap((entry) => entry.hits).map((h) => h.href)).size).toBe(3);
  });

  it("keeps two truthful kitchen records with the same name as two results", async () => {
    // ADR 019: there is no unique constraint on an inventory name, so this is
    // the ordinary case rather than a corner one.
    await food("Chicken breast", { location: "freezer", expiresOn: "2026-08-27" });
    await food("Chicken breast", { location: "fridge", expiresOn: "2026-09-05" });

    const hits = group(await searchEverything(db(), "chicken breast", NOW), "kitchen");

    expect(hits).toHaveLength(2);
    // The context line is the only thing telling them apart, so it has to.
    expect(new Set(hits.map((hit) => hit.context)).size).toBe(2);
    expect(hits.every((hit) => hit.context?.includes("Best by"))).toBe(true);
  });

  it("says what kind of thing an item is and where it is filed", async () => {
    const projectId = await project("Meal Prep");
    await itemService.captureItem(db(), { text: "Make chicken", projectId });

    const [hit] = group(await searchEverything(db(), "chicken", NOW), "item");
    expect(hit?.context).toBe("Note · Meal Prep");
  });

  it("says how much food there is and where it is kept", async () => {
    await food("Rice", { location: "pantry", quantity: 1, unit: "bag" });

    const [hit] = group(await searchEverything(db(), "rice", NOW), "kitchen");
    expect(hit?.context).toBe("Pantry · 1 bag");
  });

  it("says whether a project is still live", async () => {
    const id = await project("Old Renovation");
    await projectService.updateProject(db(), {
      id,
      name: "Old Renovation",
      description: null,
      status: "archived",
    });

    const [hit] = group(await searchEverything(db(), "renovation", NOW), "project");
    expect(hit?.context).toBe("Archived");
  });
});

describe("ordering and caps", () => {
  it("orders a domain's results the same way on every run", async () => {
    for (const name of ["Chicken thighs", "Chicken breast", "Chicken stock", "Chicken"]) {
      await food(name);
    }

    const first = titles(await searchEverything(db(), "chicken", NOW), "kitchen");
    const second = titles(await searchEverything(db(), "chicken", NOW), "kitchen");

    // Exact first, then the prefixes alphabetically. Not insertion order.
    expect(first).toEqual(["Chicken", "Chicken breast", "Chicken stock", "Chicken thighs"]);
    expect(second).toEqual(first);
  });

  it("caps each domain separately, so a flood of items cannot hide a project", async () => {
    await project("Chicken plans");
    for (let index = 0; index < SEARCH_LIMITS.item + 10; index += 1) {
      await itemService.captureItem(db(), { text: `chicken task ${index}`, projectId: null });
    }

    const results = await searchEverything(db(), "chicken", NOW);

    expect(group(results, "item")).toHaveLength(SEARCH_LIMITS.item);
    expect(titles(results, "project")).toEqual(["Chicken plans"]);
  });

  it("caps the kitchen at its own smaller limit", async () => {
    for (let index = 0; index < SEARCH_LIMITS.kitchen + 5; index += 1) {
      await food(`Chicken pack ${index}`);
    }

    const results = await searchEverything(db(), "chicken", NOW);
    expect(group(results, "kitchen")).toHaveLength(SEARCH_LIMITS.kitchen);
  });
});

/**
 * Notes joining Universal Search (0.8) — kept as its own fixture set rather
 * than folded into "searching across every domain" above, so the many
 * precise counts and orderings already pinned down there stay exactly as
 * they were.
 */
describe("notes in universal search", () => {
  it("reaches all four domains from one query at once", async () => {
    await food("Chicken thighs", { location: "fridge" });
    const meals = await project("Meal Prep", "Batch cooking chicken on Sundays");
    await itemService.captureItem(db(), { text: "Make chicken before game", projectId: meals });
    await note("Chicken stock recipe", "Roast chicken bones for an hour before simmering.");

    const results = await searchEverything(db(), "chicken", NOW);

    expect(titles(results, "kitchen")).toEqual(["Chicken thighs"]);
    expect(titles(results, "item")).toEqual(["Make chicken before game"]);
    expect(titles(results, "project")).toEqual(["Meal Prep"]);
    expect(titles(results, "note")).toEqual(["Chicken stock recipe"]);
    expect(results.total).toBe(4);
  });

  it("opens the note's own page, not a second page search invents", async () => {
    const noteId = await note("Apartment measurements");
    const results = await searchEverything(db(), "apartment", NOW);

    expect(group(results, "note")[0]?.href).toBe(`/notes/${noteId}`);
  });

  it("shows the project and an excerpt of the body as context", async () => {
    const projectId = await project("HomeQuest");
    const id = await noteService.captureNote(db(), { body: "placeholder", projectId: null });
    await noteService.updateNote(db(), {
      id,
      title: "Apartment measurements",
      body: "Kitchen is roughly 10 by 12 feet.",
      tags: [],
      projectId,
    });

    const [hit] = group(await searchEverything(db(), "apartment", NOW), "note");
    expect(hit?.context).toBe("HomeQuest · Kitchen is roughly 10 by 12 feet.");
  });

  it(
    "ranks a note found only through its body in the secondary tier — " +
      "the ranking seam needed nothing note-specific to express this",
    async () => {
      await note("Car reference", "The tire pressure should be kept at 35 psi.");
      await note("Tire pressure"); // the title *is* the query — an exact match

      const hits = group(await searchEverything(db(), "tire pressure", NOW), "note");
      const byBody = hits.find((hit) => hit.title === "Car reference");
      const byTitle = hits.find((hit) => hit.title === "Tire pressure");

      expect(byBody?.tier).toBe("secondary");
      expect(byTitle?.tier).toBe("exact");
      // And the title match is what leads the group — ranking still works
      // for notes with zero note-specific ranking code.
      expect(hits[0]?.title).toBe("Tire pressure");
    },
  );

  it("keeps two notes with the same title as two separate, findable results", async () => {
    await note("Ideas", "first idea");
    await note("Ideas", "second idea");

    const hits = group(await searchEverything(db(), "ideas", NOW), "note");
    expect(hits).toHaveLength(2);
    expect(new Set(hits.map((hit) => hit.href)).size).toBe(2);
  });

  it("caps notes at their own limit, the same as items", async () => {
    for (let index = 0; index < SEARCH_LIMITS.note + 5; index += 1) {
      await note(`Chicken note ${index}`);
    }

    const results = await searchEverything(db(), "chicken", NOW);
    expect(group(results, "note")).toHaveLength(SEARCH_LIMITS.note);
  });

  it("finds a pinned note the same as any other — pin state has no bearing on search", async () => {
    const id = await note("Pinned reference");
    await noteService.setNotePinned(db(), id, true);

    const results = await searchEverything(db(), "pinned reference", NOW);
    expect(titles(results, "note")).toEqual(["Pinned reference"]);
  });
});

describe("what search deliberately cannot see", () => {
  it("does not surface a pending AI proposal as though the user had filed it", async () => {
    // A proposal nobody accepted was never put into TylerOS, so finding it
    // again would be finding something that is not there. The item keeps the
    // words the user actually typed, and only those. See ADR 027.
    const projectId = await project("Zibberwock");
    const itemId = await itemService.captureItem(db(), { text: "sort the shed", projectId: null });

    const stored = await suggestions.suggestForItem(db(), itemId, async () => ({
      ok: true,
      model: "test-model",
      suggestion: { kind: null, project: "Zibberwock", tags: [] },
    }));
    expect(stored).toMatchObject({ status: "stored" });

    const results = await searchEverything(db(), "zibberwock", NOW);

    // The project is real and findable. The pending proposal to file the shed
    // into it is not a second result, and does not drag the item in with it.
    expect(titles(results, "project")).toEqual(["Zibberwock"]);
    expect(titles(results, "item")).toEqual([]);
    expect(results.total).toBe(1);

    // Accepting is what makes it a fact — and then the ordinary item search
    // finds it, through the project it was genuinely filed into.
    const [pending] = await suggestions.listPendingSuggestionsForItem(db(), itemId);
    if (pending === undefined) throw new Error("Expected a pending suggestion to accept.");
    await suggestions.acceptSuggestion(db(), pending.id);

    const [hit] = group(await searchEverything(db(), "shed", NOW), "item");
    expect(hit?.context).toBe("Note · Zibberwock");
    expect(projectId).toBeTruthy();
  });
});
