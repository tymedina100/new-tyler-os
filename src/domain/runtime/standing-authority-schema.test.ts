import { describe, expect, it } from "vitest";
import {
  grantStandingAuthoritySchema,
  standingAuthorityKeySchema,
} from "./standing-authority-schema";

describe("grantStandingAuthoritySchema", () => {
  it("requires an explicit role, job kind, and action", () => {
    expect(grantStandingAuthoritySchema.safeParse({ key: "miles-ai-briefing-note" }).success).toBe(
      false,
    );
    expect(
      grantStandingAuthoritySchema.safeParse({
        key: "miles-ai-briefing-note",
        role: "miles",
      }).success,
    ).toBe(false);
    expect(
      grantStandingAuthoritySchema.safeParse({
        key: "miles-ai-briefing-note",
        role: "miles",
        jobKind: "today_briefing_ai",
      }).success,
    ).toBe(false);
  });

  it("does not accept a role-only grant", () => {
    expect(
      grantStandingAuthoritySchema.safeParse({
        key: "miles-anything",
        role: "miles",
      }).success,
    ).toBe(false);
  });

  it("rejects speculative policy fields", () => {
    expect(
      grantStandingAuthoritySchema.safeParse({
        key: "miles-ai-briefing-note",
        role: "miles",
        jobKind: "today_briefing_ai",
        action: "create_note",
        spendLimitUsd: 20,
        rules: { confidence: 0.9 },
      }).success,
    ).toBe(false);
  });

  it("accepts the Miles AI briefing note grant", () => {
    expect(
      grantStandingAuthoritySchema.parse({
        key: "miles-ai-briefing-note",
        role: "miles",
        jobKind: "today_briefing_ai",
        action: "create_note",
      }),
    ).toEqual({
      key: "miles-ai-briefing-note",
      role: "miles",
      jobKind: "today_briefing_ai",
      action: "create_note",
    });
  });
});

describe("standingAuthorityKeySchema", () => {
  it("rejects an empty key", () => {
    expect(standingAuthorityKeySchema.safeParse({ key: "" }).success).toBe(false);
  });
});
