import { describe, expect, it } from "vitest";
import { describeAuthConfig } from "./auth-config";

const STRONG_SECRET = "kZ8x2mQ9pR4vN7wL1jH6sT3fG5bC0dY8"; // 32 chars, generated
const STRONG_PASSPHRASE = "correct horse battery";

describe("describeAuthConfig", () => {
  it("is open in development with nothing set", () => {
    expect(
      describeAuthConfig({
        AUTH_PASSPHRASE: undefined,
        SESSION_SECRET: undefined,
        isDevelopment: true,
      }),
    ).toEqual({ mode: "open" });
  });

  it("is misconfigured outside development with nothing set", () => {
    const result = describeAuthConfig({
      AUTH_PASSPHRASE: undefined,
      SESSION_SECRET: undefined,
      isDevelopment: false,
    });
    expect(result.mode).toBe("misconfigured");
  });

  it("is guarded when both values are strong, in development or not", () => {
    for (const isDevelopment of [true, false]) {
      expect(
        describeAuthConfig({
          AUTH_PASSPHRASE: STRONG_PASSPHRASE,
          SESSION_SECRET: STRONG_SECRET,
          isDevelopment,
        }),
      ).toEqual({ mode: "guarded", passphrase: STRONG_PASSPHRASE, secret: STRONG_SECRET });
    }
  });

  it("is misconfigured when only one of the two is set", () => {
    const onlyPassphrase = describeAuthConfig({
      AUTH_PASSPHRASE: STRONG_PASSPHRASE,
      SESSION_SECRET: undefined,
      isDevelopment: false,
    });
    expect(onlyPassphrase.mode).toBe("misconfigured");

    const onlySecret = describeAuthConfig({
      AUTH_PASSPHRASE: undefined,
      SESSION_SECRET: STRONG_SECRET,
      isDevelopment: true, // even in development: half-configured is not "open"
    });
    expect(onlySecret.mode).toBe("misconfigured");
  });

  it("rejects a session secret shorter than 32 characters", () => {
    const result = describeAuthConfig({
      AUTH_PASSPHRASE: STRONG_PASSPHRASE,
      SESSION_SECRET: "too-short",
      isDevelopment: false,
    });
    expect(result.mode).toBe("misconfigured");
  });

  it("rejects a passphrase shorter than 16 characters", () => {
    const result = describeAuthConfig({
      AUTH_PASSPHRASE: "short",
      SESSION_SECRET: STRONG_SECRET,
      isDevelopment: false,
    });
    expect(result.mode).toBe("misconfigured");
  });

  it("rejects a long value with too few distinct characters", () => {
    const result = describeAuthConfig({
      AUTH_PASSPHRASE: STRONG_PASSPHRASE,
      SESSION_SECRET: "a".repeat(40),
      isDevelopment: false,
    });
    expect(result.mode).toBe("misconfigured");
  });

  it("rejects a repeating pattern with too few distinct characters", () => {
    const result = describeAuthConfig({
      AUTH_PASSPHRASE: STRONG_PASSPHRASE,
      SESSION_SECRET: "ababababababababababababababababab",
      isDevelopment: false,
    });
    expect(result.mode).toBe("misconfigured");
  });

  it("rejects known placeholder values even when long enough", () => {
    const result = describeAuthConfig({
      AUTH_PASSPHRASE: "correct-horse-battery-staple",
      SESSION_SECRET: STRONG_SECRET,
      isDevelopment: false,
    });
    expect(result.mode).toBe("misconfigured");
  });

  it("rejects placeholders case-insensitively", () => {
    // Same value as the placeholder test above, differently cased. Long and
    // varied enough to pass the length and distinct-character checks, so this
    // isolates the placeholder-set comparison specifically.
    const result = describeAuthConfig({
      AUTH_PASSPHRASE: "Correct-Horse-Battery-Staple",
      SESSION_SECRET: STRONG_SECRET,
      isDevelopment: false,
    });
    expect(result.mode).toBe("misconfigured");
  });

  it("treats an empty string the same as unset", () => {
    const result = describeAuthConfig({
      AUTH_PASSPHRASE: "",
      SESSION_SECRET: STRONG_SECRET,
      isDevelopment: false,
    });
    expect(result.mode).toBe("misconfigured");
  });

  it("treats whitespace-only input the same as unset", () => {
    const result = describeAuthConfig({
      AUTH_PASSPHRASE: "   ",
      SESSION_SECRET: STRONG_SECRET,
      isDevelopment: false,
    });
    expect(result.mode).toBe("misconfigured");
  });
});
