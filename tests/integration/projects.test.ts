import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/shared/errors";
import * as itemService from "@/server/items/item-service";
import * as projectService from "@/server/projects/project-service";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

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

describe("projects", () => {
  it("refuses a duplicate name regardless of casing", async () => {
    await projectService.createProject(db(), {
      name: "Kitchen Refresh",
      description: null,
      status: "active",
    });

    await expect(
      projectService.createProject(db(), {
        name: "kitchen refresh",
        description: null,
        status: "active",
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("counts progress across every item in the project", async () => {
    const projectId = await projectService.createProject(db(), {
      name: "Kitchen Refresh",
      description: null,
      status: "active",
    });

    const first = await itemService.captureItem(db(), { text: "measure the wall", projectId });
    await itemService.captureItem(db(), { text: "order tiles", projectId });
    await itemService.captureItem(db(), { text: "book the plumber", projectId });
    await itemService.toggleItemCompletionById(db(), first);

    const [project] = await projectService.listProjectsWithProgress(db());
    expect(project?.progress).toEqual({
      total: 3,
      completed: 1,
      open: 2,
      percentComplete: 33,
    });
  });

  it("excludes archived items from progress entirely", async () => {
    const projectId = await projectService.createProject(db(), {
      name: "Garage",
      description: null,
      status: "active",
    });

    await itemService.captureItem(db(), { text: "keep this", projectId });
    const dropped = await itemService.captureItem(db(), { text: "never mind", projectId });
    await itemService.setItemStatus(db(), dropped, "archived");

    const [project] = await projectService.listProjectsWithProgress(db());
    expect(project?.progress.total).toBe(1);
  });

  it("keeps items when their project is deleted", async () => {
    const projectId = await projectService.createProject(db(), {
      name: "Temporary",
      description: null,
      status: "active",
    });
    const itemId = await itemService.captureItem(db(), { text: "outlives the project", projectId });

    await projectService.deleteProject(db(), projectId);

    const item = await itemService.getItem(db(), itemId);
    expect(item?.title).toBe("outlives the project");
    expect(item?.projectId).toBeNull();
  });

  it("orders active projects ahead of finished ones", async () => {
    await projectService.createProject(db(), {
      name: "Zebra",
      description: null,
      status: "active",
    });
    await projectService.createProject(db(), {
      name: "Alpha",
      description: null,
      status: "done",
    });

    const projects = await projectService.listProjectsWithProgress(db());
    expect(projects.map((project) => project.name)).toEqual(["Zebra", "Alpha"]);
  });

  it("reports a missing project rather than failing silently", async () => {
    await expect(
      projectService.deleteProject(db(), "00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
