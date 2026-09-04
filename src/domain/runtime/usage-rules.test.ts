import { describe, expect, it } from "vitest";
import { isDeterministic, ledgerUsage } from "./usage-rules";

describe("ledgerUsage", () => {
  it("records explicit zeros for deterministic work", () => {
    expect(
      ledgerUsage({
        provider: "none",
        model: "deterministic",
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
      }),
    ).toEqual({
      provider: "none",
      model: "deterministic",
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    });
  });

  it("leaves model usage unchanged", () => {
    const usage = {
      provider: "anthropic",
      model: "claude-opus-5",
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 4,
      estimatedCostUsd: 0.02,
    };
    expect(ledgerUsage(usage)).toEqual(usage);
  });
});

describe("isDeterministic", () => {
  it("treats none/deterministic as zero-AI", () => {
    expect(isDeterministic({ provider: "none", model: "deterministic" })).toBe(true);
    expect(isDeterministic({ provider: "anthropic", model: "claude" })).toBe(false);
  });
});
