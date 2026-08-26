import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { itemRecurrence } from "@/server/db/schema";
import * as itemService from "@/server/items/item-service";
import { getAgendaData } from "@/server/agenda/agenda-service";
import { addInventoryItem } from "@/server/kitchen/inventory-service";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

let harness: TestDatabase;

/** A Tuesday. Fixed, so "every Tuesday" means the same thing in November. */
const TUESDAY = new Date(2026, 7, 25, 9, 0, 0);
const THURSDAY = new Date(2026, 7, 27, 9, 0, 0);

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

/** Everything a repeating responsibility needs: a title, a date, and a rule. */
async function recurringItem(
  text: string,
  dueOn: string,
  rule: { frequency: "daily" | "weekly" | "monthly"; interval: number },
  now = TUESDAY,
): Promise<string> {
  const id = await itemService.captureItem(db(), { text, projectId: null }, now);
  await itemService.setItemDueDate(db(), id, dueOn);
  await itemService.setItemRecurrence(db(), id, rule, now);
  return id;
}

async function load(id: string) {
  const item = await itemService.getItem(db(), id);
  if (!item) throw new Error(`Item ${id} vanished.`);
  return item;
}

describe("storing a repeat", () => {
  it("keeps the rule beside the item rather than on it", async () => {
    const id = await recurringItem("take the bins out", "2026-08-25", {
      frequency: "weekly",
      interval: 1,
    });

    const item = await load(id);

    expect(item.dueOn).toBe("2026-08-25");
    expect(item.recurrence).toEqual({
      frequency: "weekly",
      interval: 1,
      anchorOn: "2026-08-25",
      lastCompletedOn: null,
    });
  });

  it("gives an undated item today as its first occurrence", async () => {
    const id = await itemService.captureItem(db(), { text: "stretch", projectId: null }, TUESDAY);
    await itemService.setItemRecurrence(db(), id, { frequency: "daily", interval: 1 }, TUESDAY);

    const item = await load(id);
    expect(item.dueOn).toBe("2026-08-25");
    expect(item.recurrence?.anchorOn).toBe("2026-08-25");
    // Being given a schedule is a decision about it, so it leaves the inbox.
    expect(item.status).toBe("active");
  });

  /**
   * The point of these is not that the parser works — that has 90-odd fast
   * tests of its own. It is that a repeat typed into the capture bar lands in
   * the same row, with the same anchor, as one set up by hand. Two ways in, one
   * meaning, or the rest of the recurrence behaviour only half works.
   */
  describe("captured as text", () => {
    it("stores what the editor would have stored", async () => {
      const captured = await itemService.captureItem(
        db(),
        { text: "take the bins out every tuesday", projectId: null },
        TUESDAY,
      );
      const byHand = await recurringItem("take the bins out", "2026-08-25", {
        frequency: "weekly",
        interval: 1,
      });

      const [fromCapture, fromEditor] = [await load(captured), await load(byHand)];

      expect(fromCapture.title).toBe("take the bins out");
      expect(fromCapture.dueOn).toBe(fromEditor.dueOn);
      expect(fromCapture.recurrence).toEqual(fromEditor.recurrence);
    });

    it("anchors an undated repeat on today, exactly as the editor does", async () => {
      const id = await itemService.captureItem(
        db(),
        { text: "pay rent monthly", projectId: null },
        TUESDAY,
      );

      const item = await load(id);
      expect(item.title).toBe("pay rent");
      expect(item.dueOn).toBe("2026-08-25");
      expect(item.recurrence).toEqual({
        frequency: "monthly",
        interval: 1,
        anchorOn: "2026-08-25",
        lastCompletedOn: null,
      });
    });

    it("takes a stated date as the anchor, alongside a project and a tag", async () => {
      const { createProject } = await import("@/server/projects/project-service");
      const projectId = await createProject(db(), {
        name: "Home",
        description: null,
        status: "active",
      });

      const id = await itemService.captureItem(
        db(),
        { text: "deep clean every 3 months friday @Home #chores", projectId: null },
        TUESDAY,
      );

      const item = await load(id);
      expect(item.title).toBe("deep clean");
      expect(item.dueOn).toBe("2026-08-28");
      expect(item.projectId).toBe(projectId);
      expect(item.tags.map((tag) => tag.name)).toEqual(["chores"]);
      expect(item.recurrence).toMatchObject({
        frequency: "monthly",
        interval: 3,
        anchorOn: "2026-08-28",
      });
    });

    it("writes exactly one recurrence row, and none for ordinary captures", async () => {
      await itemService.captureItem(
        db(),
        { text: "water plants daily", projectId: null },
        TUESDAY,
      );
      await itemService.captureItem(
        db(),
        { text: "read Every Day by David Levithan", projectId: null },
        TUESDAY,
      );

      const rows = await db().select().from(itemRecurrence);
      expect(rows).toHaveLength(1);
    });

    it("hands a captured repeat straight into the completion behaviour", async () => {
      // Nothing special is done for captured repeats afterwards, and this is
      // what proves it: completing one rolls forward by the schedule.
      const id = await itemService.captureItem(
        db(),
        { text: "take the bins out every tuesday", projectId: null },
        TUESDAY,
      );

      // Done two days late; bin day stays Tuesday rather than moving to Thursday.
      const outcome = await itemService.toggleItemCompletionById(db(), id, THURSDAY);

      expect(outcome.nextDueOn).toBe("2026-09-01");
      const item = await load(id);
      expect(item.dueOn).toBe("2026-09-01");
      expect(item.status).not.toBe("done");
      expect(item.recurrence?.lastCompletedOn).toBe("2026-08-27");
    });
  });

  it("replaces a rule rather than accumulating rules", async () => {
    const id = await recurringItem("water the plants", "2026-08-25", {
      frequency: "daily",
      interval: 1,
    });
    await itemService.setItemRecurrence(db(), id, { frequency: "weekly", interval: 2 }, TUESDAY);

    const rows = await db().select().from(itemRecurrence);
    expect(rows).toHaveLength(1);
    expect((await load(id)).recurrence).toMatchObject({ frequency: "weekly", interval: 2 });
  });
});

describe("completing an occurrence", () => {
  it("moves the item on and leaves it open", async () => {
    const id = await recurringItem("take the bins out", "2026-08-25", {
      frequency: "weekly",
      interval: 1,
    });

    const outcome = await itemService.toggleItemCompletionById(db(), id, TUESDAY);
    const item = await load(id);

    expect(outcome.nextDueOn).toBe("2026-09-01");
    expect(item.dueOn).toBe("2026-09-01");
    expect(item.status).toBe("active");
    expect(item.completedAt).toBeNull();
    expect(item.recurrence?.lastCompletedOn).toBe("2026-08-25");
  });

  it("stays on the schedule when it is done late", async () => {
    const id = await recurringItem("take the bins out", "2026-08-25", {
      frequency: "weekly",
      interval: 1,
    });

    await itemService.toggleItemCompletionById(db(), id, THURSDAY);
    const item = await load(id);

    // Bin day is Tuesday. Doing it on Thursday does not move bin day.
    expect(item.dueOn).toBe("2026-09-01");
    expect(item.recurrence?.lastCompletedOn).toBe("2026-08-27");
  });

  it("cannot be reached through the status field either", async () => {
    const id = await recurringItem("pay rent", "2026-09-01", {
      frequency: "monthly",
      interval: 1,
    });

    await itemService.setItemStatus(db(), id, "done", TUESDAY);
    const item = await load(id);

    expect(item.status).not.toBe("done");
    expect(item.dueOn).toBe("2026-10-01");
  });

  it("keeps a monthly repeat on its own day across a short February", async () => {
    const id = await recurringItem(
      "pay the service charge",
      "2026-01-31",
      { frequency: "monthly", interval: 1 },
      new Date(2026, 0, 31, 9, 0, 0),
    );

    await itemService.toggleItemCompletionById(db(), id, new Date(2026, 1, 1, 9, 0, 0));
    expect((await load(id)).dueOn).toBe("2026-02-28");

    // Saving the editor without touching the date must not re-anchor to the 28th.
    await itemService.updateItem(
      db(),
      {
        id,
        title: "pay the service charge",
        body: null,
        kind: "task",
        status: "active",
        dueOn: "2026-02-28",
        projectId: null,
        tags: [],
        recurrence: { frequency: "monthly", interval: 1 },
      },
      new Date(2026, 1, 10, 9, 0, 0),
    );
    expect((await load(id)).recurrence?.anchorOn).toBe("2026-01-31");

    await itemService.toggleItemCompletionById(db(), id, new Date(2026, 2, 1, 9, 0, 0));
    expect((await load(id)).dueOn).toBe("2026-03-31");
  });
});

describe("skipping an occurrence", () => {
  it("moves on without recording that anything was done", async () => {
    const id = await recurringItem("clean the bathroom", "2026-08-25", {
      frequency: "weekly",
      interval: 1,
    });

    const outcome = await itemService.skipItemOccurrence(db(), id, TUESDAY);
    const item = await load(id);

    expect(outcome.nextDueOn).toBe("2026-09-01");
    expect(item.dueOn).toBe("2026-09-01");
    expect(item.recurrence?.lastCompletedOn).toBeNull();
  });

  it("is refused for something that does not repeat", async () => {
    const id = await itemService.captureItem(db(), { text: "call mum", projectId: null }, TUESDAY);
    await expect(itemService.skipItemOccurrence(db(), id, TUESDAY)).rejects.toThrow();
  });
});

describe("changing and removing a repeat", () => {
  it("stops repeating without disturbing the date", async () => {
    const id = await recurringItem("change the sheets", "2026-08-25", {
      frequency: "weekly",
      interval: 2,
    });

    await itemService.setItemRecurrence(db(), id, null, TUESDAY);
    const item = await load(id);

    expect(item.recurrence).toBeNull();
    expect(item.dueOn).toBe("2026-08-25");
    expect(await db().select().from(itemRecurrence)).toHaveLength(0);
  });

  it("reschedules the series when the date is deliberately moved", async () => {
    const id = await recurringItem("take the bins out", "2026-08-25", {
      frequency: "weekly",
      interval: 1,
    });

    await itemService.setItemDueDate(db(), id, "2026-08-27");
    expect((await load(id)).recurrence?.anchorOn).toBe("2026-08-27");

    await itemService.toggleItemCompletionById(db(), id, THURSDAY);
    expect((await load(id)).dueOn).toBe("2026-09-03");
  });

  it("refuses to clear the date of something that repeats", async () => {
    const id = await recurringItem("take the bins out", "2026-08-25", {
      frequency: "weekly",
      interval: 1,
    });

    await expect(itemService.setItemDueDate(db(), id, null)).rejects.toThrow();
    expect((await load(id)).dueOn).toBe("2026-08-25");
  });

  it("takes the rule with the item when the item is deleted", async () => {
    const id = await recurringItem("take the bins out", "2026-08-25", {
      frequency: "weekly",
      interval: 1,
    });

    await itemService.deleteItem(db(), id);
    expect(await db().select().from(itemRecurrence)).toHaveLength(0);
  });
});

describe("Today and Upcoming", () => {
  it("shows an overdue repeat as overdue, at the date it was really due", async () => {
    await recurringItem(
      "take the bins out",
      "2026-08-04",
      { frequency: "weekly", interval: 1 },
      new Date(2026, 7, 4, 9, 0, 0),
    );

    const { view } = await itemService.getTodayData(db(), TUESDAY);

    expect(view.overdue.map((entry) => entry.title)).toEqual(["take the bins out"]);
    expect(view.overdue[0]?.dueOn).toBe("2026-08-04");
    expect(view.overdue[0]?.recurrence).toMatchObject({ frequency: "weekly" });
  });

  it("puts every domain that has a date on the right day of the fortnight", async () => {
    const parcel = await itemService.captureItem(
      db(),
      { text: "return the parcel", projectId: null },
      TUESDAY,
    );
    await itemService.setItemDueDate(db(), parcel, "2026-08-28");

    await recurringItem("take the bins out", "2026-08-25", { frequency: "weekly", interval: 1 });

    await addInventoryItem(db(), {
      name: "chicken breast",
      location: "fridge",
      quantity: 2,
      unit: "lb",
      expiresOn: "2026-08-28",
      notes: null,
    });

    const { agenda } = await getAgendaData(db(), TUESDAY);
    const dates = agenda.days.map((day) => day.date);

    expect(agenda.from).toBe("2026-08-26");
    expect(agenda.to).toBe("2026-09-08");
    expect(dates).toEqual(["2026-08-28", "2026-09-01", "2026-09-08"]);

    const friday = agenda.days[0];
    expect(friday?.items.map((entry) => entry.title)).toEqual(["return the parcel"]);
    expect(friday?.expiring.map((entry) => entry.name)).toEqual(["chicken breast"]);

    // Both future bin days are projections. Neither exists as a row.
    expect(agenda.days[1]?.repeats.map((entry) => entry.title)).toEqual(["take the bins out"]);
    expect(agenda.days[2]?.repeats.map((entry) => entry.title)).toEqual(["take the bins out"]);
    expect(agenda.days[1]?.items).toEqual([]);
  });

  it("leaves a completed occurrence's old date behind entirely", async () => {
    const id = await recurringItem("take the bins out", "2026-08-25", {
      frequency: "weekly",
      interval: 1,
    });
    await itemService.toggleItemCompletionById(db(), id, TUESDAY);

    const { view } = await itemService.getTodayData(db(), TUESDAY);
    const { agenda } = await getAgendaData(db(), TUESDAY);

    expect(view.dueToday).toEqual([]);
    expect(view.overdue).toEqual([]);
    // The next occurrence is a real due date now, not a projection.
    expect(agenda.days[0]?.date).toBe("2026-09-01");
    expect(agenda.days[0]?.items.map((entry) => entry.title)).toEqual(["take the bins out"]);
  });
});
