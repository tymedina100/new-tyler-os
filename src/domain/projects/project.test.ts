import { describe, expect, it } from "vitest";
import { computeProjectProgress } from "./project";

describe("computeProjectProgress", () => {
  it("reports zero rather than dividing by zero for an empty project", () => {
    expect(computeProjectProgress(0, 0)).toEqual({
      total: 0,
      completed: 0,
      open: 0,
      percentComplete: 0,
    });
  });

  it("rounds to whole percentage points", () => {
    expect(computeProjectProgress(2, 1).percentComplete).toBe(33);
    expect(computeProjectProgress(1, 2).percentComplete).toBe(67);
  });

  it("reaches 100 only when nothing is open", () => {
    expect(computeProjectProgress(0, 5).percentComplete).toBe(100);
    expect(computeProjectProgress(1, 99).percentComplete).toBe(99);
  });
});
