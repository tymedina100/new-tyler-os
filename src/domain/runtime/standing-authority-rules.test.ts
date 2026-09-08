import { describe, expect, it } from "vitest";
import type { StandingAuthority } from "./standing-authority";
import { matchStandingAuthority, proposalDisposition } from "./standing-authority-rules";

const NOW = new Date("2026-09-08T12:00:00.000Z");

const milesAiNote: StandingAuthority = {
  id: "auth-1",
  key: "miles-ai-briefing-note",
  role: "miles",
  jobKind: "today_briefing_ai",
  action: "create_note",
  enabled: true,
  createdAt: NOW,
  updatedAt: NOW,
};

describe("matchStandingAuthority", () => {
  it("matches only the exact role, job kind, and action", () => {
    expect(
      matchStandingAuthority([milesAiNote], {
        role: "miles",
        jobKind: "today_briefing_ai",
        action: "create_note",
      })?.key,
    ).toBe("miles-ai-briefing-note");
  });

  it("does not match the wrong role", () => {
    expect(
      matchStandingAuthority([milesAiNote], {
        role: "forge",
        jobKind: "today_briefing_ai",
        action: "create_note",
      }),
    ).toBeNull();
  });

  it("does not match the wrong job kind", () => {
    expect(
      matchStandingAuthority([milesAiNote], {
        role: "miles",
        jobKind: "today_briefing",
        action: "create_note",
      }),
    ).toBeNull();
  });

  it("does not match a disabled grant", () => {
    expect(
      matchStandingAuthority([{ ...milesAiNote, enabled: false }], {
        role: "miles",
        jobKind: "today_briefing_ai",
        action: "create_note",
      }),
    ).toBeNull();
  });

  it("cannot match on role alone", () => {
    expect(
      matchStandingAuthority([milesAiNote], {
        role: "miles",
        jobKind: "today_briefing",
        action: "create_note",
      }),
    ).toBeNull();
  });

  it("picks a stable key when two enabled rows match the same triple", () => {
    const later: StandingAuthority = {
      ...milesAiNote,
      id: "auth-2",
      key: "zzz-duplicate-triple",
    };
    expect(
      matchStandingAuthority([later, milesAiNote], {
        role: "miles",
        jobKind: "today_briefing_ai",
        action: "create_note",
      })?.key,
    ).toBe("miles-ai-briefing-note");
  });
});

describe("proposalDisposition", () => {
  it("leaves a proposal pending when nothing authorized it", () => {
    expect(proposalDisposition(true, false)).toBe("pending_approval");
  });

  it("auto-executes only when a proposal and a match are both present", () => {
    expect(proposalDisposition(true, true)).toBe("auto_executed");
    expect(proposalDisposition(false, true)).toBe("none");
    expect(proposalDisposition(false, false)).toBe("none");
  });
});
