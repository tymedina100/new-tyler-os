import { describe, expect, it } from "vitest";
import type { Item } from "@/domain/items/item";
import { buildTodayView } from "./today-view";

const TODAY = "2026-08-24";

type TestItem = Pick<Item, "status" | "dueOn" | "createdAt"> & { id: string };

function item(id: string, overrides: Partial<TestItem> = {}): TestItem {
  return {
    id,
    status: "active",
    dueOn: null,
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    ...overrides,
  };
}

function ids(items: readonly TestItem[]): string[] {
  return items.map((entry) => entry.id);
}

describe("buildTodayView", () => {
  it("splits dated work into overdue, today and the coming week", () => {
    const view = buildTodayView(
      [
        item("overdue", { dueOn: "2026-08-20" }),
        item("today", { dueOn: TODAY }),
        item("soon", { dueOn: "2026-08-28" }),
        item("far", { dueOn: "2026-10-01" }),
      ],
      TODAY,
    );

    expect(ids(view.overdue)).toEqual(["overdue"]);
    expect(ids(view.dueToday)).toEqual(["today"]);
    expect(ids(view.upcoming)).toEqual(["soon"]);
    expect(view.totalSurfaced).toBe(3);
  });

  it("includes the last day of the upcoming window but not the day after", () => {
    const view = buildTodayView(
      [item("edge", { dueOn: "2026-08-31" }), item("beyond", { dueOn: "2026-09-01" })],
      TODAY,
    );

    expect(ids(view.upcoming)).toEqual(["edge"]);
  });

  it("never lists the same item in two buckets", () => {
    const view = buildTodayView([item("dated-inbox", { status: "inbox", dueOn: TODAY })], TODAY);

    expect(ids(view.dueToday)).toEqual(["dated-inbox"]);
    expect(view.needsTriage).toEqual([]);
  });

  it("surfaces undated inbox items as needing triage, newest first", () => {
    const view = buildTodayView(
      [
        item("older", { status: "inbox", createdAt: new Date("2026-08-01T09:00:00.000Z") }),
        item("newer", { status: "inbox", createdAt: new Date("2026-08-23T09:00:00.000Z") }),
      ],
      TODAY,
    );

    expect(ids(view.needsTriage)).toEqual(["newer", "older"]);
  });

  it("leaves triaged undated work off Today entirely", () => {
    const view = buildTodayView(
      [item("someday-idea", { status: "someday" }), item("no-date", { status: "active" })],
      TODAY,
    );

    expect(view.totalSurfaced).toBe(0);
  });

  it("still nags about a someday item that was given a date", () => {
    const view = buildTodayView([item("dated-someday", { status: "someday", dueOn: TODAY })], TODAY);

    expect(ids(view.dueToday)).toEqual(["dated-someday"]);
  });

  it("ignores completed and archived work", () => {
    const view = buildTodayView(
      [
        item("done", { status: "done", dueOn: "2026-08-01" }),
        item("archived", { status: "archived", dueOn: "2026-08-01" }),
      ],
      TODAY,
    );

    expect(view.totalSurfaced).toBe(0);
  });

  it("orders overdue work oldest-due first", () => {
    const view = buildTodayView(
      [
        item("less-late", { dueOn: "2026-08-23" }),
        item("very-late", { dueOn: "2026-07-01" }),
        item("mid", { dueOn: "2026-08-10" }),
      ],
      TODAY,
    );

    expect(ids(view.overdue)).toEqual(["very-late", "mid", "less-late"]);
  });
});
