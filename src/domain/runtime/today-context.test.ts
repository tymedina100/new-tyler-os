import { describe, expect, it } from "vitest";
import { boundTodayContext, todayHasMaterial, type TodayContext } from "./today-context";

const EMPTY: TodayContext = {
  today: "2026-09-05",
  overdue: [],
  dueToday: [],
  upcoming: [],
  needsTriage: [],
  expiringSoon: [],
};

describe("todayHasMaterial", () => {
  it("treats empty Today as zero-AI", () => {
    expect(todayHasMaterial(EMPTY)).toBe(false);
    expect(todayHasMaterial({ ...EMPTY, overdue: [{ id: "1", title: "  ", dueOn: null }] })).toBe(
      false,
    );
  });

  it("treats a titled due-today item as material", () => {
    expect(
      todayHasMaterial({
        ...EMPTY,
        dueToday: [{ id: "1", title: "Review TylerOS runtime PR", dueOn: "2026-09-05" }],
      }),
    ).toBe(true);
  });
});

describe("boundTodayContext", () => {
  it("clips a giant title so one record cannot explode context", () => {
    const title = `Review ${"x".repeat(400)}`;
    const bounded = boundTodayContext({
      ...EMPTY,
      dueToday: [{ id: "1", title, dueOn: "2026-09-05" }],
    });
    expect(bounded.dueToday[0]?.title.length).toBeLessThanOrEqual(160);
  });
});
