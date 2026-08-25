import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as itemService from "@/server/items/item-service";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

let harness: TestDatabase;

/** Fixed so the assertions do not drift with the calendar. */
const NOW = new Date(2026, 7, 24, 9, 0, 0);

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

describe("getTodayData", () => {
  it("returns empty buckets for an empty system", async () => {
    const { today, view } = await itemService.getTodayData(db(), NOW);

    expect(today).toBe("2026-08-24");
    expect(view.totalSurfaced).toBe(0);
  });

  it("buckets real items by how urgent they are", async () => {
    const overdue = await itemService.captureItem(db(), {
      text: "pay electric bill",
      projectId: null,
    });
    await itemService.setItemDueDate(db(), overdue, "2026-08-20");

    const today = await itemService.captureItem(db(), {
      text: "call the dentist",
      projectId: null,
    });
    await itemService.setItemDueDate(db(), today, "2026-08-24");

    const soon = await itemService.captureItem(db(), {
      text: "return the parcel",
      projectId: null,
    });
    await itemService.setItemDueDate(db(), soon, "2026-08-27");

    const later = await itemService.captureItem(db(), { text: "renew passport", projectId: null });
    await itemService.setItemDueDate(db(), later, "2026-11-01");

    await itemService.captureItem(db(), { text: "look into a monitor arm", projectId: null });

    const { view } = await itemService.getTodayData(db(), NOW);

    expect(view.overdue.map((item) => item.title)).toEqual(["pay electric bill"]);
    expect(view.dueToday.map((item) => item.title)).toEqual(["call the dentist"]);
    expect(view.upcoming.map((item) => item.title)).toEqual(["return the parcel"]);
    expect(view.needsTriage.map((item) => item.title)).toEqual(["look into a monitor arm"]);
  });

  it("drops completed work off Today", async () => {
    const id = await itemService.captureItem(db(), { text: "take out the bins", projectId: null });
    await itemService.setItemDueDate(db(), id, "2026-08-24");
    await itemService.toggleItemCompletionById(db(), id);

    const { view } = await itemService.getTodayData(db(), NOW);
    expect(view.totalSurfaced).toBe(0);
  });

  it("carries project and tag context into the view", async () => {
    const { createProject } = await import("@/server/projects/project-service");
    const projectId = await createProject(db(), {
      name: "Kitchen Refresh",
      description: null,
      status: "active",
    });

    const id = await itemService.captureItem(db(), { text: "order tiles #home", projectId });
    await itemService.setItemDueDate(db(), id, "2026-08-24");

    const { view } = await itemService.getTodayData(db(), NOW);
    const [item] = view.dueToday;

    expect(item?.project?.name).toBe("Kitchen Refresh");
    expect(item?.tags.map((tag) => tag.name)).toEqual(["home"]);
  });
});
