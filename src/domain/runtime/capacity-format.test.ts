import { describe, expect, it } from "vitest";
import { formatEstimatedCostUsd } from "./capacity";

describe("formatEstimatedCostUsd", () => {
  it("renders a measured zero as dollars and null as unknown", () => {
    expect(formatEstimatedCostUsd(0)).toBe("$0.0000");
    expect(formatEstimatedCostUsd(0.02)).toBe("$0.0200");
    expect(formatEstimatedCostUsd(null)).toBe("cost unknown");
    expect(formatEstimatedCostUsd(0)).not.toBe(formatEstimatedCostUsd(null));
  });
});
