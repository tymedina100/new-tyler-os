import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/shared/errors";
import * as itemService from "@/server/items/item-service";
import * as noteService from "@/server/notes/note-service";
import * as projectService from "@/server/projects/project-service";
import { listTagsWithUsage } from "@/server/tags/tag-repository";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

/**
 * What only the database can prove about notes: the generated `tsvector`
 * actually finds body-only text, a project link really does `set null` when
 * the project goes, and — the cross-domain regression this milestone
 * introduces the risk of — a tag shared by an item and a note survives
 * losing either one alone.
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

async function makeNote(
  overrides: Partial<{
    title: string;
    body: string;
    tags: string[];
    projectId: string | null;
  }> = {},
) {
  const captured = await noteService.captureNote(db(), { body: "placeholder", projectId: null });
  return noteService.updateNote(db(), {
    id: captured,
    title: overrides.title ?? null,
    body: overrides.body ?? "placeholder",
    tags: overrides.tags ?? [],
    projectId: overrides.projectId ?? null,
  });
}

describe("creating a note", () => {
  it("derives a title from the first line of the body", async () => {
    const id = await noteService.captureNote(db(), {
      body: "Mazda6 maintenance\ntire pressure is 35 psi",
      projectId: null,
    });

    const note = await noteService.getNote(db(), id);
    expect(note?.title).toBe("Mazda6 maintenance");
    expect(note?.body).toBe("Mazda6 maintenance\ntire pressure is 35 psi");
  });

  it("starts unpinned and with no project", async () => {
    const id = await noteService.captureNote(db(), { body: "Some idea", projectId: null });
    const note = await noteService.getNote(db(), id);

    expect(note?.pinned).toBe(false);
    expect(note?.projectId).toBeNull();
  });
});

describe("updating a note", () => {
  it("stores an explicit title, tags and a project", async () => {
    const projectId = await projectService.createProject(db(), {
      name: "HomeQuest",
      description: null,
      status: "active",
    });

    const created = await noteService.captureNote(db(), { body: "placeholder", projectId: null });
    await noteService.updateNote(db(), {
      id: created,
      title: "Apartment measurements",
      body: "kitchen: 10x12\nliving room: 14x16",
      tags: ["apartment", "measurements"],
      projectId,
    });

    const note = await noteService.getNote(db(), created);
    expect(note?.title).toBe("Apartment measurements");
    expect(note?.tags.map((tag) => tag.name).sort()).toEqual(["apartment", "measurements"]);
    expect(note?.project?.id).toBe(projectId);
  });

  it("re-derives the title when it is cleared back to blank", async () => {
    const id = await makeNote({ title: "Old title", body: "New first line\nrest" });
    await noteService.updateNote(db(), {
      id,
      title: null,
      body: "New first line\nrest",
      tags: [],
      projectId: null,
    });

    expect((await noteService.getNote(db(), id))?.title).toBe("New first line");
  });

  it("reports a missing note rather than failing silently", async () => {
    await expect(
      noteService.updateNote(db(), {
        id: "00000000-0000-4000-8000-000000000000",
        title: "x",
        body: "",
        tags: [],
        projectId: null,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("pinning", () => {
  it("toggles pinned and reflects it in list ordering", async () => {
    const older = await makeNote({ title: "Older, unpinned" });
    const newer = await makeNote({ title: "Newer, unpinned" });

    let notes = await noteService.listNotes(db());
    expect(notes.map((n) => n.id)).toEqual([newer, older]);

    await noteService.setNotePinned(db(), older, true);
    notes = await noteService.listNotes(db());
    expect(notes.map((n) => n.id)).toEqual([older, newer]);

    // Unpinning is itself a write, so it also touches `older`'s `updatedAt` —
    // pin state no longer favours it, but its own timestamp now does. That is
    // the honest, unsurprising consequence of "most recently touched," not a
    // special case pinning needs to account for.
    await noteService.setNotePinned(db(), older, false);
    notes = await noteService.listNotes(db());
    expect(notes.map((n) => n.id)).toEqual([older, newer]);
  });

  it("reports a missing note", async () => {
    await expect(
      noteService.setNotePinned(db(), "00000000-0000-4000-8000-000000000000", true),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("project links", () => {
  it("keeps the note when its project is deleted, clearing the link", async () => {
    const projectId = await projectService.createProject(db(), {
      name: "Temporary",
      description: null,
      status: "active",
    });
    const id = await makeNote({ title: "Outlives the project", projectId });

    await projectService.deleteProject(db(), projectId);

    const note = await noteService.getNote(db(), id);
    expect(note?.title).toBe("Outlives the project");
    expect(note?.projectId).toBeNull();
  });

  it("scopes listNotes to one project", async () => {
    const projectId = await projectService.createProject(db(), {
      name: "HomeQuest",
      description: null,
      status: "active",
    });
    await makeNote({ title: "In the project", projectId });
    await makeNote({ title: "Not in the project" });

    const scoped = await noteService.listNotes(db(), { projectId });
    expect(scoped.map((n) => n.title)).toEqual(["In the project"]);
  });
});

describe("tags shared with items — the cross-domain orphan-deletion fix", () => {
  it("keeps a tag alive for a note after an item stops using it", async () => {
    const itemId = await itemService.captureItem(db(), { text: "fix the fence", projectId: null });
    await itemService.updateItem(db(), {
      id: itemId,
      title: "fix the fence",
      body: null,
      kind: "task",
      status: "active",
      dueOn: null,
      projectId: null,
      tags: ["home"],
      recurrence: null,
    });
    await makeNote({ title: "Home reference", tags: ["home"] });

    // The item lets go of the tag entirely — this is exactly the path that
    // used to delete "home" out from under the note, because the old
    // deleteOrphanedTags only ever checked item_tags.
    await itemService.updateItem(db(), {
      id: itemId,
      title: "fix the fence",
      body: null,
      kind: "task",
      status: "active",
      dueOn: null,
      projectId: null,
      tags: [],
      recurrence: null,
    });

    const names = (await listTagsWithUsage(db())).map((tag) => tag.name);
    expect(names).toContain("home");
  });

  it("removes a tag once neither an item nor a note uses it any more", async () => {
    const noteId = await makeNote({ title: "Temporary", tags: ["scratch"] });
    expect((await listTagsWithUsage(db())).map((tag) => tag.name)).toContain("scratch");

    await noteService.updateNote(db(), {
      id: noteId,
      title: "Temporary",
      body: "placeholder",
      tags: [],
      projectId: null,
    });

    expect((await listTagsWithUsage(db())).map((tag) => tag.name)).not.toContain("scratch");
  });

  it("removes an orphaned tag when the note that held it is deleted", async () => {
    const noteId = await makeNote({ title: "Temporary", tags: ["ephemeral"] });
    await noteService.deleteNote(db(), noteId);

    expect((await listTagsWithUsage(db())).map((tag) => tag.name)).not.toContain("ephemeral");
  });
});

describe("deleting a note", () => {
  it("reports a missing note rather than failing silently", async () => {
    await expect(
      noteService.deleteNote(db(), "00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("finding notes", () => {
  it("matches on the title", async () => {
    await makeNote({ title: "Mazda6 maintenance", body: "placeholder" });
    await makeNote({ title: "Unrelated" });

    const results = await noteService.findNotes(db(), "mazda6");
    expect(results.map((n) => n.title)).toEqual(["Mazda6 maintenance"]);
  });

  it("matches on body text the title never mentions — the whole point of a tsvector", async () => {
    await makeNote({
      title: "Car reference",
      body: "The tire pressure should be kept at 35 psi front and rear.",
    });

    const results = await noteService.findNotes(db(), "tire pressure");
    expect(results.map((n) => n.title)).toEqual(["Car reference"]);
  });

  it("returns nothing for an empty query rather than everything", async () => {
    await makeNote({ title: "Something" });
    expect(await noteService.findNotes(db(), "   ")).toEqual([]);
  });

  it("keeps two notes with the same title as two separate results", async () => {
    await makeNote({ title: "Ideas", body: "first" });
    await makeNote({ title: "Ideas", body: "second" });

    const results = await noteService.findNotes(db(), "ideas");
    expect(results).toHaveLength(2);
  });
});
