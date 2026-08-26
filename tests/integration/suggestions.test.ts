import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/domain/shared/errors";
import type { Classification, Classifier } from "@/server/ai/classify-capture";
import * as itemService from "@/server/items/item-service";
import { createProject } from "@/server/projects/project-service";
import { listTagsWithUsage } from "@/server/tags/tag-repository";
import * as suggestions from "@/server/suggestions/suggestion-service";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

/**
 * The suggestion subsystem, end to end through real SQL and with the provider
 * replaced by a function literal.
 *
 * No network is opened here and none can be: `Classifier` is a parameter, so a
 * fake is a lambda rather than a mocked module. That is the whole reason the
 * seam is a function type — `pnpm test` stays runnable with no database, no
 * network and no API key, exactly as it was before this milestone.
 *
 * What these cover that the pure rules cannot: the unique proposal index, the
 * check constraint, cascade on delete, and that accepting really does write
 * through the ordinary item service.
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

/** A classifier that always answers the same thing. The provider, replaced. */
function answering(suggestion: {
  kind?: string | null;
  project?: string | null;
  tags?: string[];
}): Classifier {
  return async () => ({
    ok: true,
    model: "test-model",
    suggestion: {
      kind: suggestion.kind ?? null,
      project: suggestion.project ?? null,
      tags: suggestion.tags ?? [],
    },
  });
}

/** A classifier that fails the way a provider does. */
function failing(failure: Extract<Classification, { ok: false }>["failure"]): Classifier {
  return async () => ({ ok: false, failure });
}

const NEVER_CALLED: Classifier = async () => {
  throw new Error("The classifier must not be called.");
};

async function capture(text: string, projectId: string | null = null) {
  return itemService.captureItem(db(), { text, projectId });
}

/** Establishes a tag in the vocabulary, since suggestions may only reuse one. */
async function seedTag(name: string) {
  await capture(`something #${name}`);
}

async function pending(itemId: string) {
  return suggestions.listPendingSuggestionsForItem(db(), itemId);
}

describe("proposing", () => {
  it("stores a kind, a project and a tag as three independent proposals", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    await seedTag("maintenance");
    const id = await capture("replace air filter");

    const outcome = await suggestions.suggestForItem(
      db(),
      id,
      answering({ kind: "task", project: "Home", tags: ["maintenance"] }),
    );

    expect(outcome).toEqual({ status: "stored", count: 3 });
    expect((await pending(id)).map((row) => row.field)).toEqual(["kind", "project", "tag"]);
  });

  it("resolves the project so the UI is never handed a bare id", async () => {
    await createProject(db(), { name: "Desk Setup", description: null, status: "active" });
    const id = await capture("look into standing desk arms");

    await suggestions.suggestForItem(db(), id, answering({ project: "Desk Setup" }));

    const [project] = (await pending(id)).filter((row) => row.field === "project");
    expect(project?.project?.name).toBe("Desk Setup");
  });

  it("leaves the item completely untouched", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    const id = await capture("replace air filter");
    const before = await itemService.getItem(db(), id);

    await suggestions.suggestForItem(db(), id, answering({ kind: "task", project: "Home" }));

    const after = await itemService.getItem(db(), id);
    expect(after?.kind).toBe(before?.kind);
    expect(after?.projectId).toBeNull();
    expect(after?.status).toBe("inbox");
  });

  it("never creates a project the model named", async () => {
    const id = await capture("replace air filter");

    const outcome = await suggestions.suggestForItem(db(), id, answering({ project: "Garage" }));

    expect(outcome).toEqual({ status: "skipped", reason: "nothing_grounded" });
    expect(await pending(id)).toEqual([]);
  });

  it("never creates a tag the model named", async () => {
    const id = await capture("replace air filter");

    await suggestions.suggestForItem(db(), id, answering({ tags: ["woodworking"] }));

    expect(await listTagsWithUsage(db())).toEqual([]);
    expect(await pending(id)).toEqual([]);
  });

  it("does not offer a project that is finished or archived", async () => {
    await createProject(db(), { name: "Old Move", description: null, status: "archived" });
    const id = await capture("replace air filter");

    await suggestions.suggestForItem(db(), id, answering({ project: "Old Move" }));

    expect(await pending(id)).toEqual([]);
  });

  it("does not ask at all when the parser already filed everything", async () => {
    const projectId = await createProject(db(), {
      name: "Home",
      description: null,
      status: "active",
    });
    // Captured into a project, so `initialCaptureStatus` already triaged it.
    const id = await capture("replace air filter", projectId);

    const outcome = await suggestions.suggestForItem(db(), id, NEVER_CALLED);

    expect(outcome).toEqual({ status: "skipped", reason: "already_decided" });
  });

  it("does not propose a kind the item already has", async () => {
    const id = await capture("a thought");

    const outcome = await suggestions.suggestForItem(db(), id, answering({ kind: "note" }));

    expect(outcome).toEqual({ status: "skipped", reason: "nothing_grounded" });
  });

  it("does not propose a tag the capture already carries", async () => {
    await seedTag("urgent");
    const id = await capture("clean bathroom #urgent");

    // The tag list is not even sent for an item the user tagged, so a model
    // answering with tags is answering a question it was not asked.
    const outcome = await suggestions.suggestForItem(db(), id, answering({ tags: ["urgent"] }));

    expect(outcome).toEqual({ status: "skipped", reason: "nothing_grounded" });
  });

  it("skips an item deleted before the suggestion came back", async () => {
    const id = await capture("replace air filter");
    await itemService.deleteItem(db(), id);

    const outcome = await suggestions.suggestForItem(db(), id, NEVER_CALLED);

    expect(outcome).toEqual({ status: "skipped", reason: "item_gone" });
  });

  it.each([
    "not_configured",
    "timeout",
    "network",
    "rate_limited",
    "client_error",
    "server_error",
    "refused",
    "truncated",
    "empty_response",
    "malformed_response",
  ] as const)("reports %s without writing anything or touching the item", async (failure) => {
    const id = await capture("replace air filter");

    const outcome = await suggestions.suggestForItem(db(), id, failing(failure));

    expect(outcome).toEqual({ status: "failed", failure });
    expect(await pending(id)).toEqual([]);
    // The capture is exactly as it was. This is the promise the whole feature
    // rests on: AI can fail in ten different ways and lose nothing.
    const item = await itemService.getItem(db(), id);
    expect(item?.title).toBe("replace air filter");
    expect(item?.status).toBe("inbox");
  });
});

describe("duplicate requests", () => {
  it("proposes once per item, however many times it is asked", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    const id = await capture("replace air filter");
    const classify = answering({ kind: "task", project: "Home" });

    const first = await suggestions.suggestForItem(db(), id, classify);
    const second = await suggestions.suggestForItem(db(), id, classify);

    expect(first).toEqual({ status: "stored", count: 2 });
    expect(second).toEqual({ status: "skipped", reason: "already_suggested" });
    expect(await pending(id)).toHaveLength(2);
  });

  it("does not resurrect a proposal the user dismissed", async () => {
    const id = await capture("replace air filter");
    const classify = answering({ kind: "task" });

    await suggestions.suggestForItem(db(), id, classify);
    await suggestions.dismissItemSuggestions(db(), id);
    await suggestions.suggestForItem(db(), id, classify);

    expect(await pending(id)).toEqual([]);
  });

  it("collapses concurrent passes onto the same rows", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    const id = await capture("replace air filter");
    const classify = answering({ kind: "task", project: "Home" });

    // Both read an empty table before either writes, so the guard cannot help
    // here — the unique proposal index is what stops the duplicate.
    await Promise.all([
      suggestions.suggestForItem(db(), id, classify),
      suggestions.suggestForItem(db(), id, classify),
    ]);

    expect(await pending(id)).toHaveLength(2);
  });
});

describe("accepting", () => {
  it("applies a kind through the ordinary item service, triaging it out of the inbox", async () => {
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ kind: "task" }));
    const [suggestion] = await pending(id);

    const result = await suggestions.acceptSuggestion(db(), suggestion!.id);

    expect(result.outcome).toBe("applicable");
    const item = await itemService.getItem(db(), id);
    expect(item?.kind).toBe("task");
    expect(item?.status).toBe("active");
    expect(await pending(id)).toEqual([]);
  });

  it("files an item into a suggested project", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ project: "Home" }));
    const [suggestion] = await pending(id);

    await suggestions.acceptSuggestion(db(), suggestion!.id);

    expect((await itemService.getItem(db(), id))?.project?.name).toBe("Home");
  });

  it("adds a suggested tag without disturbing the others", async () => {
    await seedTag("maintenance");
    const id = await capture("replace air filter #home");
    await seedTag("home");
    // The item was captured with a tag, so tags are not a gap. Suggest against
    // a second item that has none, then check the additive write in isolation.
    const bare = await capture("replace air filter");
    await suggestions.suggestForItem(db(), bare, answering({ tags: ["maintenance"] }));
    const [suggestion] = await pending(bare);

    await suggestions.acceptSuggestion(db(), suggestion!.id);

    const item = await itemService.getItem(db(), bare);
    expect(item?.tags.map((tag) => tag.name)).toEqual(["maintenance"]);
    // A tag says what something is about, not what it is. It must not take an
    // untriaged item off the triage screen.
    expect(item?.status).toBe("inbox");
    expect(await pending(id)).toEqual([]);
  });

  it("accepts one proposal and leaves its siblings pending", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    await seedTag("maintenance");
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(
      db(),
      id,
      answering({ kind: "task", project: "Home", tags: ["maintenance"] }),
    );

    const project = (await pending(id)).find((row) => row.field === "project");
    await suggestions.acceptSuggestion(db(), project!.id);

    // Accepting the project mutated the item. The tag and the kind must both
    // survive that — partial acceptance is the whole point.
    const remaining = await pending(id);
    expect(remaining.map((row) => row.field).sort()).toEqual(["kind", "tag"]);
    expect((await itemService.getItem(db(), id))?.project?.name).toBe("Home");
  });

  it("still applies a sibling after one has been accepted", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    await seedTag("maintenance");
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(
      db(),
      id,
      answering({ project: "Home", tags: ["maintenance"] }),
    );

    for (const suggestion of await pending(id)) {
      const result = await suggestions.acceptSuggestion(db(), suggestion.id);
      expect(result.outcome).toBe("applicable");
    }

    const item = await itemService.getItem(db(), id);
    expect(item?.project?.name).toBe("Home");
    expect(item?.tags.map((tag) => tag.name)).toEqual(["maintenance"]);
  });
});

describe("stale suggestions", () => {
  it("refuses to undo a project the user chose in the meantime", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    const deskId = await createProject(db(), {
      name: "Desk Setup",
      description: null,
      status: "active",
    });
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ project: "Home" }));
    const [suggestion] = await pending(id);

    // The user picks a different project before getting round to the chip.
    await itemService.setItemProject(db(), id, deskId);

    const result = await suggestions.acceptSuggestion(db(), suggestion!.id);

    expect(result.outcome).toBe("superseded");
    // The newer manual choice survives. This is the case the milestone was
    // written around.
    expect((await itemService.getItem(db(), id))?.project?.name).toBe("Desk Setup");
    expect(await pending(id)).toEqual([]);
  });

  it("refuses a kind the user has already triaged themselves", async () => {
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ kind: "task" }));
    const [suggestion] = await pending(id);

    await itemService.setItemKind(db(), id, "idea");

    const result = await suggestions.acceptSuggestion(db(), suggestion!.id);

    expect(result.outcome).toBe("superseded");
    expect((await itemService.getItem(db(), id))?.kind).toBe("idea");
  });

  it("stales every proposal once the item is retitled", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ kind: "task", project: "Home" }));

    await itemService.updateItem(db(), {
      id,
      title: "buy milk",
      body: null,
      kind: "note",
      status: "inbox",
      dueOn: null,
      projectId: null,
      tags: [],
      recurrence: null,
    });

    for (const suggestion of await pending(id)) {
      const result = await suggestions.acceptSuggestion(db(), suggestion.id);
      expect(result.outcome).toBe("superseded");
    }

    const item = await itemService.getItem(db(), id);
    expect(item?.title).toBe("buy milk");
    expect(item?.kind).toBe("note");
    expect(item?.projectId).toBeNull();
  });

  it("treats a value the user reached independently as already done", async () => {
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ kind: "task" }));
    const [suggestion] = await pending(id);

    await itemService.setItemKind(db(), id, "task");

    const result = await suggestions.acceptSuggestion(db(), suggestion!.id);

    expect(result.outcome).toBe("redundant");
    expect((await itemService.getItem(db(), id))?.kind).toBe("task");
  });

  it("is idempotent when the same proposal is accepted twice", async () => {
    await seedTag("maintenance");
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ tags: ["maintenance"] }));
    const [suggestion] = await pending(id);

    await suggestions.acceptSuggestion(db(), suggestion!.id);
    const second = await suggestions.acceptSuggestion(db(), suggestion!.id);

    expect(second.outcome).toBe("redundant");
    // A double-clicked button must not add the tag twice.
    expect((await itemService.getItem(db(), id))?.tags).toHaveLength(1);
  });

  it("refuses an accepted-then-dismissed proposal rather than reapplying it", async () => {
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ kind: "task" }));
    const [suggestion] = await pending(id);

    await suggestions.dismissSuggestion(db(), suggestion!.id);
    const result = await suggestions.acceptSuggestion(db(), suggestion!.id);

    expect(result.outcome).toBe("superseded");
    expect((await itemService.getItem(db(), id))?.kind).toBe("note");
  });
});

describe("dismissing", () => {
  it("changes nothing about the item", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ kind: "task", project: "Home" }));

    const count = await suggestions.dismissItemSuggestions(db(), id);

    expect(count).toBe(2);
    const item = await itemService.getItem(db(), id);
    expect(item?.kind).toBe("note");
    expect(item?.projectId).toBeNull();
    expect(item?.status).toBe("inbox");
  });

  it("dismisses one proposal and leaves the rest", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ kind: "task", project: "Home" }));
    const [first] = await pending(id);

    await suggestions.dismissSuggestion(db(), first!.id);

    expect(await pending(id)).toHaveLength(1);
  });

  it("refuses to act on a suggestion that does not exist", async () => {
    await expect(
      suggestions.dismissSuggestion(db(), "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("cascade", () => {
  it("takes suggestions with the item when it is deleted", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ kind: "task", project: "Home" }));
    const [suggestion] = await pending(id);

    await itemService.deleteItem(db(), id);

    // Accepting a chip on a page the user left open must fail cleanly rather
    // than resurrect anything.
    await expect(suggestions.acceptSuggestion(db(), suggestion!.id)).rejects.toThrow(NotFoundError);
    expect(await pending(id)).toEqual([]);
  });

  it("takes a project suggestion with the project", async () => {
    const projectId = await createProject(db(), {
      name: "Home",
      description: null,
      status: "active",
    });
    const id = await capture("replace air filter");
    await suggestions.suggestForItem(db(), id, answering({ kind: "task", project: "Home" }));

    await deleteProject(projectId);

    // The item survives its project — that is `on delete set null` on items.
    // A proposal to file something into a project that no longer exists does
    // not, which is why this foreign key cascades instead.
    expect((await pending(id)).map((row) => row.field)).toEqual(["kind"]);
  });
});

describe("listing", () => {
  it("groups pending proposals by item in one query", async () => {
    await createProject(db(), { name: "Home", description: null, status: "active" });
    const first = await capture("replace air filter");
    const second = await capture("look into standing desk arms");
    await suggestions.suggestForItem(db(), first, answering({ kind: "task", project: "Home" }));
    await suggestions.suggestForItem(db(), second, answering({ kind: "idea" }));

    const grouped = await suggestions.listPendingSuggestionsByItem(db(), [first, second]);

    expect(grouped.get(first)).toHaveLength(2);
    expect(grouped.get(second)).toHaveLength(1);
  });

  it("returns nothing for items nobody proposed anything about", async () => {
    const id = await capture("replace air filter");

    expect(await suggestions.listPendingSuggestionsByItem(db(), [id])).toEqual(new Map());
    expect(await suggestions.listPendingSuggestionsByItem(db(), [])).toEqual(new Map());
  });
});

/** Proves the seam is real: with AI unconfigured, nothing reaches a provider. */
describe("with AI unconfigured", () => {
  it("never calls the classifier from the capture path", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_SUGGESTIONS", "off");

    const { runSuggestionPass } = await import("@/server/suggestions/suggestion-run");
    const classify = vi.fn<Classifier>();
    const id = await capture("replace air filter");

    await runSuggestionPass(db(), id, classify);

    expect(classify).not.toHaveBeenCalled();
    expect(await pending(id)).toEqual([]);
    vi.unstubAllEnvs();
  });
});

async function deleteProject(id: string) {
  const { deleteProject: remove } = await import("@/server/projects/project-service");
  await remove(harness.db, id);
}
