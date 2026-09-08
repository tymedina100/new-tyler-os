import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/shared/errors";
import { assertAiProfileEnabled, assertExplicitAiProfileId } from "./ai-profile-rules";

describe("assertExplicitAiProfileId", () => {
  it("refuses automatic selection", () => {
    expect(() => assertExplicitAiProfileId(undefined)).toThrow(DomainError);
    expect(() => assertExplicitAiProfileId(null)).toThrow(/will not choose/);
  });
});

describe("assertAiProfileEnabled", () => {
  it("blocks a disabled profile", () => {
    expect(() => assertAiProfileEnabled({ enabled: false, key: "miles-briefing-primary" })).toThrow(
      /disabled/,
    );
  });
});
