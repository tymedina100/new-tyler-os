import { describe, expect, it } from "vitest";
import { operationsHaveActivity, operationsNeedAttention } from "./operations-summary";
import { boundTodayContext, todayHasMaterial } from "./today-context";

const summary = {
  since: "2026-09-08T12:00:00Z",
  asOf: "2026-09-09T12:00:00Z",
  pendingApprovals: 0,
  failedJobs: 0,
  savedNotes: 0,
};
describe("operations summary", () => {
  it("distinguishes completed work from work needing Tyler", () => {
    expect(operationsHaveActivity(summary)).toBe(false);
    expect(operationsNeedAttention({ ...summary, savedNotes: 2 })).toBe(false);
    expect(operationsHaveActivity({ ...summary, savedNotes: 2 })).toBe(true);
    expect(operationsNeedAttention({ ...summary, pendingApprovals: 1 })).toBe(true);
    expect(operationsNeedAttention({ ...summary, failedJobs: 1 })).toBe(true);
  });
  it("retains aggregate context without making briefings recursively generate briefings", () => {
    const context = {
      today: "2026-09-09",
      overdue: [],
      dueToday: [],
      upcoming: [],
      needsTriage: [],
      expiringSoon: [],
      operations: { ...summary, pendingApprovals: 4, savedNotes: 2 },
      consumptionYesterday: { day: "2026-09-08", timeZone: "America/Phoenix", food: 2, drink: 1 },
    };
    expect(boundTodayContext(context).operations).toEqual(context.operations);
    expect(boundTodayContext(context).consumptionYesterday).toEqual(context.consumptionYesterday);
    expect(todayHasMaterial(context)).toBe(false);
  });
});
