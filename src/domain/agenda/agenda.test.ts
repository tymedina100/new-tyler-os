import { describe, expect, it } from "vitest";
import type { Item } from "@/domain/items/item";
import type { InventoryItem } from "@/domain/kitchen/inventory";
import type { ItemRecurrence } from "@/domain/recurrence/recurrence";
import { buildAgenda } from "./agenda";

/** The window used throughout: a week starting the Wednesday after a Tuesday. */
const FROM = "2026-08-26";
const DAYS = 7;

type TestItem = Pick<Item, "status" | "dueOn"> & {
  id: string;
  recurrence: ItemRecurrence | null;
};

type TestFood = Pick<InventoryItem, "expiresOn"> & { id: string };

function item(id: string, overrides: Partial<TestItem> = {}): TestItem {
  return { id, status: "active", dueOn: null, recurrence: null, ...overrides };
}

function food(id: string, expiresOn: string | null): TestFood {
  return { id, expiresOn };
}

function repeats(overrides: Partial<ItemRecurrence> = {}): ItemRecurrence {
  return {
    frequency: "weekly",
    interval: 1,
    anchorOn: "2026-08-25",
    lastCompletedOn: null,
    ...overrides,
  };
}

function build(items: TestItem[], expiring: TestFood[] = []) {
  return buildAgenda({ items, expiring }, { from: FROM, days: DAYS });
}

describe("buildAgenda", () => {
  it("puts each source on its own day, in its own list", () => {
    const agenda = build(
      [item("parcel", { dueOn: "2026-08-27" })],
      [food("chicken", "2026-08-27"), food("milk", "2026-08-29")],
    );

    expect(agenda.days.map((day) => day.date)).toEqual(["2026-08-27", "2026-08-29"]);
    expect(agenda.days[0]?.items.map((entry) => entry.id)).toEqual(["parcel"]);
    expect(agenda.days[0]?.expiring.map((entry) => entry.id)).toEqual(["chicken"]);
    expect(agenda.days[1]?.expiring.map((entry) => entry.id)).toEqual(["milk"]);
    expect(agenda.totalSurfaced).toBe(3);
  });

  it("leaves empty days out entirely, because a grid of blanks is a calendar", () => {
    const agenda = build([item("parcel", { dueOn: "2026-08-28" })]);

    expect(agenda.days).toHaveLength(1);
    expect(agenda.from).toBe(FROM);
    expect(agenda.to).toBe("2026-09-01");
  });

  it("ignores anything outside the window at either end", () => {
    const agenda = build(
      [
        item("yesterday", { dueOn: "2026-08-25" }),
        item("beyond", { dueOn: "2026-09-02" }),
        item("last-day", { dueOn: "2026-09-01" }),
      ],
      [food("old", "2026-01-01")],
    );

    expect(agenda.days.map((day) => day.date)).toEqual(["2026-09-01"]);
  });

  it("projects the repeats a recurring item will have, without inventing rows", () => {
    const agenda = build([item("bins", { dueOn: "2026-09-01", recurrence: repeats() })]);

    // September 1st is the real occurrence; the 8th would be beyond the window.
    expect(agenda.days.map((day) => day.date)).toEqual(["2026-09-01"]);
    expect(agenda.days[0]?.items.map((entry) => entry.id)).toEqual(["bins"]);
    expect(agenda.days[0]?.repeats).toEqual([]);
  });

  it("never lists the current occurrence as a projection of itself", () => {
    const agenda = buildAgenda(
      { items: [item("bins", { dueOn: "2026-09-01", recurrence: repeats() })], expiring: [] },
      { from: FROM, days: 21 },
    );

    const first = agenda.days.find((day) => day.date === "2026-09-01");
    const second = agenda.days.find((day) => day.date === "2026-09-08");

    expect(first?.items.map((entry) => entry.id)).toEqual(["bins"]);
    expect(first?.repeats).toEqual([]);
    expect(second?.items).toEqual([]);
    expect(second?.repeats.map((entry) => entry.id)).toEqual(["bins"]);
  });

  it("still shows the coming repeats of something whose occurrence is overdue", () => {
    // The overdue occurrence belongs to Today. The fortnight ahead still has
    // bin days in it, and hiding them would make the view a lie.
    const agenda = build([item("bins", { dueOn: "2026-08-04", recurrence: repeats() })]);

    expect(agenda.days.map((day) => day.date)).toEqual(["2026-09-01"]);
    expect(agenda.days[0]?.repeats.map((entry) => entry.id)).toEqual(["bins"]);
    expect(agenda.days[0]?.items).toEqual([]);
  });

  it("shows a daily repeat on every day of the window", () => {
    const daily = repeats({ frequency: "daily", anchorOn: "2026-08-25" });
    const agenda = build([item("vitamins", { dueOn: "2026-08-26", recurrence: daily })]);

    expect(agenda.days).toHaveLength(DAYS);
    expect(agenda.days[0]?.items.map((entry) => entry.id)).toEqual(["vitamins"]);
    expect(agenda.days[1]?.repeats.map((entry) => entry.id)).toEqual(["vitamins"]);
  });

  it("leaves closed work and undated things off entirely", () => {
    const agenda = build([
      item("done", { status: "done", dueOn: "2026-08-27" }),
      item("archived", { status: "archived", dueOn: "2026-08-27" }),
      item("undated"),
      item("undated-repeat", { recurrence: repeats() }),
    ]);

    expect(agenda.totalSurfaced).toBe(0);
    expect(agenda.days).toEqual([]);
  });

  it("counts everything on a day, whichever domain it came from", () => {
    const agenda = build(
      [item("a", { dueOn: "2026-08-27" }), item("b", { dueOn: "2026-08-27" })],
      [food("cheese", "2026-08-27")],
    );

    expect(agenda.days[0]?.total).toBe(3);
    expect(agenda.totalSurfaced).toBe(3);
  });

  it("ignores food with no date at all", () => {
    expect(build([], [food("rice", null)]).totalSurfaced).toBe(0);
  });
});
