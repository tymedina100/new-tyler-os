import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/shared/errors";
import * as itemService from "@/server/items/item-service";
import { listProjects } from "@/server/projects/project-repository";
import { listTagsWithUsage } from "@/server/tags/tag-repository";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

/**
 * These tests cover what the pure domain tests cannot: the SQL itself.
 * Full-text search, the generated search vector, tag de-duplication and
 * cascade behaviour only exist in the database.
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

describe("capture", () => {
  it("lands in the inbox as an untriaged note", async () => {
    const id = await itemService.captureItem(db(), { text: "buy paper towels", projectId: null });
    const item = await itemService.getItem(db(), id);

    expect(item?.title).toBe("buy paper towels");
    expect(item?.status).toBe("inbox");
    expect(item?.kind).toBe("note");
    expect(item?.dueOn).toBeNull();
  });

  it("extracts inline tags and persists them", async () => {
    const id = await itemService.captureItem(db(), {
      text: "buy paper towels #home #errand",
      projectId: null,
    });
    const item = await itemService.getItem(db(), id);

    expect(item?.title).toBe("buy paper towels");
    expect(item?.tags.map((tag) => tag.name).sort()).toEqual(["errand", "home"]);
  });

  it("reuses an existing tag rather than creating a duplicate", async () => {
    await itemService.captureItem(db(), { text: "first #home", projectId: null });
    await itemService.captureItem(db(), { text: "second #Home", projectId: null });

    const tags = await listTagsWithUsage(db());
    expect(tags).toHaveLength(1);
    expect(tags[0]?.name).toBe("home");
    expect(tags[0]?.count).toBe(2);
  });

  it("skips the inbox when captured directly into a project", async () => {
    const projectId = await createProject("Kitchen");
    const id = await itemService.captureItem(db(), { text: "replace the tap", projectId });
    const item = await itemService.getItem(db(), id);

    expect(item?.status).toBe("active");
    expect(item?.project?.name).toBe("Kitchen");
  });
});

/**
 * The parser itself is covered exhaustively by the domain tests. What can only
 * be proven here is that a parsed capture actually reaches the columns: the
 * date, the project foreign key and the tag join rows.
 */
describe("capture parsing", () => {
  const tuesday = new Date(2026, 7, 25);

  it("stores a natural-language date as a calendar date", async () => {
    const id = await itemService.captureItem(
      db(),
      { text: "pay electric bill friday", projectId: null },
      tuesday,
    );
    const item = await itemService.getItem(db(), id);

    expect(item?.title).toBe("pay electric bill");
    expect(item?.dueOn).toBe("2026-08-28");
  });

  it("resolves an inline @project against the existing projects", async () => {
    const projectId = await createProject("Kitchen Refresh");
    const id = await itemService.captureItem(
      db(),
      { text: "order worktop samples @kitchenrefresh", projectId: null },
      tuesday,
    );
    const item = await itemService.getItem(db(), id);

    expect(item?.title).toBe("order worktop samples");
    expect(item?.projectId).toBe(projectId);
    // A project is a home, so the item is already triaged.
    expect(item?.status).toBe("active");
  });

  it("keeps an unknown @project in the title rather than losing it", async () => {
    const id = await itemService.captureItem(
      db(),
      { text: "plant the bulbs @Gardening", projectId: null },
      tuesday,
    );
    const item = await itemService.getItem(db(), id);

    expect(item?.title).toBe("plant the bulbs @Gardening");
    expect(item?.projectId).toBeNull();
    expect(item?.status).toBe("inbox");
  });

  it("never creates a project just because one was referenced", async () => {
    await itemService.captureItem(db(), { text: "plant the bulbs @Gardening", projectId: null });
    expect(await listProjects(db())).toHaveLength(0);
  });

  it("stores a date, a project and tags from one capture", async () => {
    const projectId = await createProject("Kitchen Refresh");
    const id = await itemService.captureItem(
      db(),
      { text: "order the worktop @kitchen #home #urgent next friday", projectId: null },
      tuesday,
    );
    const item = await itemService.getItem(db(), id);

    expect(item?.title).toBe("order the worktop");
    expect(item?.dueOn).toBe("2026-09-04");
    expect(item?.projectId).toBe(projectId);
    expect(item?.tags.map((tag) => tag.name).sort()).toEqual(["home", "urgent"]);
  });

  it("lets an inline @project override the project the capture came from", async () => {
    const kitchen = await createProject("Kitchen Refresh");
    const media = await createProject("Media");
    const id = await itemService.captureItem(
      db(),
      { text: "watch Severance @Media", projectId: kitchen },
      tuesday,
    );
    const item = await itemService.getItem(db(), id);

    expect(item?.projectId).toBe(media);
  });

  it("leaves a dated capture in the inbox, because its kind is still unknown", async () => {
    const id = await itemService.captureItem(
      db(),
      { text: "call the plumber tomorrow", projectId: null },
      tuesday,
    );
    const item = await itemService.getItem(db(), id);

    expect(item?.status).toBe("inbox");
    expect(item?.dueOn).toBe("2026-08-26");
  });
});

describe("triage", () => {
  it("moves an item out of the inbox when it is given a kind", async () => {
    const id = await itemService.captureItem(db(), { text: "watch Severance", projectId: null });
    await itemService.setItemKind(db(), id, "media");

    const item = await itemService.getItem(db(), id);
    expect(item?.kind).toBe("media");
    expect(item?.status).toBe("active");
  });

  it("moves an item out of the inbox when it is given a due date", async () => {
    const id = await itemService.captureItem(db(), { text: "pay electric bill", projectId: null });
    await itemService.setItemDueDate(db(), id, "2026-08-28");

    const item = await itemService.getItem(db(), id);
    expect(item?.dueOn).toBe("2026-08-28");
    expect(item?.status).toBe("active");
  });

  it("leaves an already-triaged item's status alone", async () => {
    const id = await itemService.captureItem(db(), { text: "read more", projectId: null });
    await itemService.setItemStatus(db(), id, "someday");
    await itemService.setItemKind(db(), id, "idea");

    expect((await itemService.getItem(db(), id))?.status).toBe("someday");
  });
});

describe("completion", () => {
  it("stamps and clears the completion time as it toggles", async () => {
    const id = await itemService.captureItem(db(), {
      text: "finish pantry inventory",
      projectId: null,
    });

    await itemService.toggleItemCompletionById(db(), id);
    const done = await itemService.getItem(db(), id);
    expect(done?.status).toBe("done");
    expect(done?.completedAt).toBeInstanceOf(Date);

    await itemService.toggleItemCompletionById(db(), id);
    const reopened = await itemService.getItem(db(), id);
    expect(reopened?.status).toBe("active");
    expect(reopened?.completedAt).toBeNull();
  });

  it("refuses to complete an archived item", async () => {
    const id = await itemService.captureItem(db(), { text: "old idea", projectId: null });
    await itemService.setItemStatus(db(), id, "archived");

    await expect(itemService.toggleItemCompletionById(db(), id)).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it("sends a restored item back to the inbox", async () => {
    const id = await itemService.captureItem(db(), { text: "maybe later", projectId: null });
    await itemService.setItemStatus(db(), id, "archived");
    await itemService.restoreItemById(db(), id);

    expect((await itemService.getItem(db(), id))?.status).toBe("inbox");
  });
});

describe("editing", () => {
  it("replaces tags and removes ones nothing points at any more", async () => {
    const id = await itemService.captureItem(db(), {
      text: "desk research #office",
      projectId: null,
    });

    await itemService.updateItem(db(), {
      id,
      title: "research standing desks",
      body: "compare motorised frames",
      kind: "idea",
      status: "someday",
      dueOn: null,
      projectId: null,
      tags: ["furniture"],
    });

    const item = await itemService.getItem(db(), id);
    expect(item?.title).toBe("research standing desks");
    expect(item?.tags.map((tag) => tag.name)).toEqual(["furniture"]);

    const tags = await listTagsWithUsage(db());
    expect(tags.map((tag) => tag.name)).toEqual(["furniture"]);
  });

  it("removes tag links when an item is deleted", async () => {
    const id = await itemService.captureItem(db(), { text: "temporary #scratch", projectId: null });
    await itemService.deleteItem(db(), id);

    expect(await itemService.getItem(db(), id)).toBeNull();
    expect(await listTagsWithUsage(db())).toEqual([]);
  });

  it("reports a missing item rather than failing silently", async () => {
    await expect(
      itemService.deleteItem(db(), "00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("search", () => {
  beforeEach(async () => {
    await itemService.captureItem(db(), { text: "watch Severance", projectId: null });
    await itemService.captureItem(db(), { text: "buy paper towels", projectId: null });

    const id = await itemService.captureItem(db(), { text: "monitor arm", projectId: null });
    await itemService.updateItem(db(), {
      id,
      title: "monitor arm",
      body: "single arm, clamp mount, holds a heavy display",
      kind: "purchase",
      status: "active",
      dueOn: null,
      projectId: null,
      tags: [],
    });
  });

  it("finds items by a word in the title", async () => {
    const results = await searchFor("severance");
    expect(results.map((item) => item.title)).toEqual(["watch Severance"]);
  });

  it("finds items by a word in the notes", async () => {
    const results = await searchFor("clamp");
    expect(results.map((item) => item.title)).toEqual(["monitor arm"]);
  });

  it("matches word stems, not just exact spellings", async () => {
    const results = await searchFor("holding");
    expect(results.map((item) => item.title)).toEqual(["monitor arm"]);
  });

  it("still finds a half-remembered fragment", async () => {
    const results = await searchFor("sever");
    expect(results.map((item) => item.title)).toEqual(["watch Severance"]);
  });

  it("ranks a title match above a notes match", async () => {
    const results = await searchFor("arm");
    expect(results[0]?.title).toBe("monitor arm");
  });

  it("returns nothing for a term that appears nowhere", async () => {
    expect(await searchFor("helicopter")).toEqual([]);
  });

  it("treats punctuation as text rather than as query syntax", async () => {
    await expect(searchFor("100% cotton & wool")).resolves.toBeInstanceOf(Array);
  });
});

async function createProject(name: string): Promise<string> {
  const { createProject: create } = await import("@/server/projects/project-service");
  return create(db(), { name, description: null, status: "active" });
}

/** Search as the UI performs it: the universal retrieval path, no filters. */
function searchFor(query: string) {
  return itemService.findItems(db(), query, {});
}
