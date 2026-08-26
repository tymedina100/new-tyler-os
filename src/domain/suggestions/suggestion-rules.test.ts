import { describe, expect, it } from "vitest";
import type { ItemSuggestion } from "./suggestion";
import {
  groundSuggestion,
  hasAnyGap,
  MAX_TAG_SUGGESTIONS,
  reconcileSuggestion,
  type SuggestibleItem,
  type SuggestionVocabulary,
  suggestionGaps,
} from "./suggestion-rules";

const HOME = { id: "11111111-1111-4111-8111-111111111111", name: "Home" };
const DESK = { id: "22222222-2222-4222-8222-222222222222", name: "Desk Setup" };

const VOCABULARY: SuggestionVocabulary = {
  projects: [HOME, DESK],
  tags: ["maintenance", "research", "grocery", "errand"],
};

function item(overrides: Partial<SuggestibleItem> = {}): SuggestibleItem {
  return {
    title: "replace air filter",
    kind: "note",
    status: "inbox",
    projectId: null,
    tags: [],
    ...overrides,
  };
}

function stored(overrides: Partial<ItemSuggestion> = {}): ItemSuggestion {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    itemId: "44444444-4444-4444-8444-444444444444",
    field: "project",
    kind: null,
    projectId: HOME.id,
    tagName: null,
    status: "pending",
    model: "test",
    observedTitle: "replace air filter",
    observedValue: "",
    createdAt: new Date("2026-08-26T10:00:00Z"),
    resolvedAt: null,
    ...overrides,
  };
}

const ALL_GAPS = { kind: true, project: true, tags: true };

describe("suggestionGaps", () => {
  it("asks about everything an untriaged capture left undecided", () => {
    expect(suggestionGaps(item())).toEqual(ALL_GAPS);
  });

  it("does not ask about a project the capture parser already resolved", () => {
    expect(suggestionGaps(item({ projectId: HOME.id }))).toEqual({
      kind: true,
      project: false,
      tags: true,
    });
  });

  it("does not ask about tags when the user typed one", () => {
    expect(suggestionGaps(item({ tags: [{ name: "urgent" }] }))).toEqual({
      kind: true,
      project: true,
      tags: false,
    });
  });

  it("leaves an explicitly captured project and tag alone together", () => {
    // "clean bathroom every tuesday @Home #urgent" — the recurrence and the
    // date are never in this shape at all, and both remaining fields are the
    // user's own syntax. Only the kind is still an open question.
    expect(suggestionGaps(item({ projectId: HOME.id, tags: [{ name: "urgent" }] }))).toEqual({
      kind: true,
      project: false,
      tags: false,
    });
  });

  it.each(["active", "someday", "done", "archived"] as const)(
    "asks nothing about a %s item, which has already been decided about",
    (status) => {
      const gaps = suggestionGaps(item({ status }));
      expect(gaps).toEqual({ kind: false, project: false, tags: false });
      expect(hasAnyGap(gaps)).toBe(false);
    },
  );

  it("reports having something to ask", () => {
    expect(hasAnyGap(ALL_GAPS)).toBe(true);
    expect(hasAnyGap({ kind: false, project: false, tags: false })).toBe(false);
  });
});

describe("groundSuggestion", () => {
  it("grounds a kind, a project name and tags against what exists", () => {
    const proposals = groundSuggestion(
      { kind: "task", project: "Home", tags: ["maintenance"] },
      item(),
      VOCABULARY,
      ALL_GAPS,
    );

    expect(proposals).toEqual([
      { field: "kind", kind: "task", projectId: null, tagName: null, observedValue: "note" },
      { field: "project", kind: null, projectId: HOME.id, tagName: null, observedValue: "" },
      { field: "tag", kind: null, projectId: null, tagName: "maintenance", observedValue: "" },
    ]);
  });

  it("records the kind the item held, so a later manual change can win", () => {
    const [proposal] = groundSuggestion(
      { kind: "task", project: null, tags: [] },
      item({ kind: "idea" }),
      VOCABULARY,
      ALL_GAPS,
    );

    expect(proposal?.observedValue).toBe("idea");
  });

  it("drops a kind outside the enum", () => {
    expect(
      groundSuggestion({ kind: "chore", project: null, tags: [] }, item(), VOCABULARY, ALL_GAPS),
    ).toEqual([]);
  });

  it("drops a kind the item already has", () => {
    expect(
      groundSuggestion({ kind: "note", project: null, tags: [] }, item(), VOCABULARY, ALL_GAPS),
    ).toEqual([]);
  });

  it("accepts a kind in any casing the model happened to use", () => {
    const [proposal] = groundSuggestion(
      { kind: "  Task  ", project: null, tags: [] },
      item(),
      VOCABULARY,
      ALL_GAPS,
    );

    expect(proposal?.kind).toBe("task");
  });

  it("never invents a project that does not exist", () => {
    expect(
      groundSuggestion({ kind: null, project: "Garage", tags: [] }, item(), VOCABULARY, ALL_GAPS),
    ).toEqual([]);
  });

  it("matches a project name regardless of case and spacing", () => {
    const [proposal] = groundSuggestion(
      { kind: null, project: "  desk setup ", tags: [] },
      item(),
      VOCABULARY,
      ALL_GAPS,
    );

    expect(proposal?.projectId).toBe(DESK.id);
  });

  it("refuses a near miss rather than guessing which project was meant", () => {
    // `matchProjectRef` resolves a prefix a human typed. A model was handed the
    // exact list, so "Desk" is a mistake rather than an abbreviation.
    expect(
      groundSuggestion({ kind: null, project: "Desk", tags: [] }, item(), VOCABULARY, ALL_GAPS),
    ).toEqual([]);
  });

  it("never invents a tag outside the existing vocabulary", () => {
    expect(
      groundSuggestion(
        { kind: null, project: null, tags: ["woodworking"] },
        item(),
        VOCABULARY,
        ALL_GAPS,
      ),
    ).toEqual([]);
  });

  it("collapses duplicate tags that normalise to the same name", () => {
    const proposals = groundSuggestion(
      { kind: null, project: null, tags: ["Maintenance", "maintenance", "  MAINTENANCE  "] },
      item(),
      VOCABULARY,
      ALL_GAPS,
    );

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.tagName).toBe("maintenance");
  });

  it("drops a tag the item already carries", () => {
    expect(
      groundSuggestion(
        { kind: null, project: null, tags: ["maintenance"] },
        item({ tags: [{ name: "maintenance" }] }),
        VOCABULARY,
        { ...ALL_GAPS, tags: true },
      ),
    ).toEqual([]);
  });

  it("proposes no more tags than good manners allow", () => {
    const proposals = groundSuggestion(
      { kind: null, project: null, tags: ["maintenance", "research", "grocery", "errand"] },
      item(),
      VOCABULARY,
      ALL_GAPS,
    );

    expect(proposals).toHaveLength(MAX_TAG_SUGGESTIONS);
  });

  it("leaves room for the tags the item already has", () => {
    const held = ["a", "b", "c", "d", "e", "f", "g"].map((name) => ({ name }));

    const proposals = groundSuggestion(
      { kind: null, project: null, tags: ["maintenance", "research"] },
      item({ tags: held }),
      VOCABULARY,
      ALL_GAPS,
    );

    // Seven held plus a limit of eight leaves room for exactly one.
    expect(proposals).toHaveLength(1);
  });

  it("says nothing about a field that was never a gap", () => {
    const proposals = groundSuggestion(
      { kind: "task", project: "Home", tags: ["maintenance"] },
      item({ projectId: DESK.id, tags: [{ name: "urgent" }] }),
      VOCABULARY,
      { kind: true, project: false, tags: false },
    );

    // The model answered all three; only the one it was entitled to survives.
    expect(proposals).toEqual([
      { field: "kind", kind: "task", projectId: null, tagName: null, observedValue: "note" },
    ]);
  });

  it("returns nothing for an empty response", () => {
    expect(
      groundSuggestion({ kind: null, project: null, tags: [] }, item(), VOCABULARY, ALL_GAPS),
    ).toEqual([]);
  });

  it("returns nothing when the vocabulary is empty", () => {
    expect(
      groundSuggestion(
        { kind: null, project: "Home", tags: ["maintenance"] },
        item(),
        { projects: [], tags: [] },
        ALL_GAPS,
      ),
    ).toEqual([]);
  });
});

describe("reconcileSuggestion", () => {
  it("applies a project suggestion to an item that still has no project", () => {
    expect(reconcileSuggestion(stored(), item())).toBe("applicable");
  });

  it("refuses to undo a project the user chose in the meantime", () => {
    // The case the milestone was written around: AI proposed Home, the user
    // picked Desk Setup, and accepting must not reach back and overwrite it.
    expect(reconcileSuggestion(stored(), item({ projectId: DESK.id }))).toBe("superseded");
  });

  it("treats a project suggestion the user already applied as redundant", () => {
    expect(reconcileSuggestion(stored(), item({ projectId: HOME.id }))).toBe("redundant");
  });

  it("stales every suggestion once the item is retitled", () => {
    expect(reconcileSuggestion(stored(), item({ title: "buy milk" }))).toBe("superseded");
  });

  it("applies a kind suggestion while the kind is untouched", () => {
    const suggestion = stored({
      field: "kind",
      kind: "task",
      projectId: null,
      observedValue: "note",
    });

    expect(reconcileSuggestion(suggestion, item())).toBe("applicable");
  });

  it("refuses a kind suggestion once the user has triaged the kind themselves", () => {
    const suggestion = stored({
      field: "kind",
      kind: "task",
      projectId: null,
      observedValue: "note",
    });

    expect(reconcileSuggestion(suggestion, item({ kind: "idea" }))).toBe("superseded");
  });

  it("treats a kind the item already has as redundant", () => {
    const suggestion = stored({
      field: "kind",
      kind: "task",
      projectId: null,
      observedValue: "note",
    });

    expect(reconcileSuggestion(suggestion, item({ kind: "task" }))).toBe("redundant");
  });

  it("applies a tag suggestion without caring what else changed", () => {
    const suggestion = stored({ field: "tag", tagName: "maintenance", projectId: null });

    // Tags are additive, so a project chosen in the meantime is not a conflict.
    expect(reconcileSuggestion(suggestion, item({ projectId: DESK.id }))).toBe("applicable");
  });

  it("treats a tag the item already carries as redundant", () => {
    const suggestion = stored({ field: "tag", tagName: "maintenance", projectId: null });

    expect(reconcileSuggestion(suggestion, item({ tags: [{ name: "maintenance" }] }))).toBe(
      "redundant",
    );
  });

  it("stales a tag suggestion when the item has no room left", () => {
    const suggestion = stored({ field: "tag", tagName: "maintenance", projectId: null });
    const full = ["a", "b", "c", "d", "e", "f", "g", "h"].map((name) => ({ name }));

    expect(reconcileSuggestion(suggestion, item({ tags: full }))).toBe("superseded");
  });

  it("stales a proposal whose own value went missing", () => {
    expect(reconcileSuggestion(stored({ projectId: null }), item())).toBe("superseded");
    expect(reconcileSuggestion(stored({ field: "kind", projectId: null }), item())).toBe(
      "superseded",
    );
    expect(reconcileSuggestion(stored({ field: "tag", projectId: null }), item())).toBe(
      "superseded",
    );
  });

  it("keeps siblings applicable after one of them is accepted", () => {
    // Accepting the project mutates the item. A whole-response signature would
    // have staled the tag here, which is exactly what partial acceptance means.
    const tag = stored({ field: "tag", tagName: "maintenance", projectId: null });
    const afterAcceptingProject = item({ projectId: HOME.id });

    expect(reconcileSuggestion(tag, afterAcceptingProject)).toBe("applicable");
  });
});
