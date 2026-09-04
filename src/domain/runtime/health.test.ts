import { describe, expect, it } from "vitest";
import { deriveRuntimeHealth, formatLastSeen } from "./health";

const NOW = new Date("2026-09-04T12:00:00.000Z");

describe("deriveRuntimeHealth", () => {
  it("is healthy when last seen 18 seconds ago", () => {
    expect(deriveRuntimeHealth("enabled", new Date(NOW.getTime() - 18_000), NOW)).toBe("healthy");
  });

  it("is stale after the healthy window", () => {
    expect(deriveRuntimeHealth("enabled", new Date(NOW.getTime() - 3 * 60_000), NOW)).toBe("stale");
  });

  it("is offline when last seen is old or missing", () => {
    expect(deriveRuntimeHealth("enabled", new Date(NOW.getTime() - 11 * 60_000), NOW)).toBe(
      "offline",
    );
    expect(deriveRuntimeHealth("enabled", null, NOW)).toBe("offline");
  });

  it("is disabled even with a fresh heartbeat", () => {
    expect(deriveRuntimeHealth("disabled", NOW, NOW)).toBe("disabled");
  });
});

describe("formatLastSeen", () => {
  it("says never when there is no heartbeat", () => {
    expect(formatLastSeen(null, NOW)).toBe("Never seen");
  });

  it("uses seconds under a minute", () => {
    expect(formatLastSeen(new Date(NOW.getTime() - 18_000), NOW)).toBe("Last seen 18 sec ago");
  });
});
