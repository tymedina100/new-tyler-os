import { describe, expect, it } from "vitest";
import { assertCapacityRemaining, dailyBurnUsd, estimateExhaustion } from "./capacity-rules";

const NOW = new Date("2026-09-11T12:00:00.000Z");

describe("assertCapacityRemaining", () => {
  it("rejects negatives", () => {
    expect(() => assertCapacityRemaining(-1, "usd")).toThrow(/cannot be negative/);
  });

  it("rejects percent over 100", () => {
    expect(() => assertCapacityRemaining(101, "percent")).toThrow(/cannot exceed 100/);
  });

  it("accepts zero and a percent of 100", () => {
    expect(assertCapacityRemaining(0, "usd")).toBe(0);
    expect(assertCapacityRemaining(100, "percent")).toBe(100);
  });
});

describe("estimateExhaustion", () => {
  it("labels USD burn as estimated and flags exhaustion before reset", () => {
    const forecast = estimateExhaustion(
      {
        remaining: 10,
        remainingUnit: "usd",
        resetAt: new Date("2026-09-18T12:00:00.000Z"),
        enabled: true,
      },
      5,
      NOW,
    );
    expect(forecast.kind).toBe("estimated");
    expect(forecast.daysUntilExhaustion).toBe(2);
    expect(forecast.likelyBeforeReset).toBe(true);
    expect(forecast.summary).toMatch(/^Estimated/);
  });

  it("does not forecast a percent pool as USD burn", () => {
    const forecast = estimateExhaustion(
      { remaining: 40, remainingUnit: "percent", resetAt: null, enabled: true },
      3,
      NOW,
    );
    expect(forecast.daysUntilExhaustion).toBeNull();
    expect(forecast.summary).toMatch(/not tracked in USD/);
  });
});

describe("dailyBurnUsd", () => {
  it("averages non-negative costs over the window", () => {
    expect(dailyBurnUsd([7, 7], 7)).toBe(2);
  });
});
