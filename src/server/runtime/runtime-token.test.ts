import { describe, expect, it } from "vitest";
import { describeRuntimeToken, presentedTokenMatches } from "./runtime-token";

const STRONG_TOKEN = "kZ8x2mQ9pR4vN7wL1jH6sT3fG5bC0dY8";

describe("describeRuntimeToken", () => {
  it("is off when nothing is set, including in development", () => {
    const result = describeRuntimeToken({ RUNTIME_TOKEN: undefined });
    expect(result.mode).toBe("off");
  });

  it("is off for an empty or whitespace-only value", () => {
    expect(describeRuntimeToken({ RUNTIME_TOKEN: "" }).mode).toBe("off");
    expect(describeRuntimeToken({ RUNTIME_TOKEN: "   " }).mode).toBe("off");
  });

  it("is on when the token is strong", () => {
    expect(describeRuntimeToken({ RUNTIME_TOKEN: STRONG_TOKEN })).toEqual({
      mode: "on",
      token: STRONG_TOKEN,
    });
  });

  it("rejects a token shorter than 32 characters", () => {
    expect(describeRuntimeToken({ RUNTIME_TOKEN: "too-short" }).mode).toBe("off");
  });

  it("rejects a long value with too few distinct characters", () => {
    expect(describeRuntimeToken({ RUNTIME_TOKEN: "a".repeat(40) }).mode).toBe("off");
  });

  it("rejects known placeholders even when long enough", () => {
    expect(describeRuntimeToken({ RUNTIME_TOKEN: "replace-this-with-a-real-secret" }).mode).toBe(
      "off",
    );
  });
});

describe("presentedTokenMatches", () => {
  it("accepts the exact token", () => {
    expect(presentedTokenMatches(STRONG_TOKEN, STRONG_TOKEN)).toBe(true);
  });

  it("rejects a different token of the same length", () => {
    expect(presentedTokenMatches(STRONG_TOKEN, STRONG_TOKEN.replace("k", "K"))).toBe(false);
  });

  it("rejects a different length without throwing", () => {
    expect(presentedTokenMatches(STRONG_TOKEN, "nope")).toBe(false);
  });
});
