import { describe, expect, it } from "vitest";
import { mobileCaptureSchema, mobileEditSchema, mobileRequestSchema } from "./mobile-schema";
const requestId = "b4a18f20-81e3-46f6-9aa0-5c9a37109fb4";
describe("mobile input boundary", () => {
  it("requires replay IDs and refuses empty or oversized capture", () => {
    for (const input of [
      { text: "test" },
      { requestId, text: " " },
      { requestId, text: "x".repeat(10007) },
    ])
      expect(mobileCaptureSchema.safeParse(input).success).toBe(false);
  });
  it("rejects paid requests and hidden authorization fields", () => {
    expect(mobileRequestSchema.safeParse({ requestId, kind: "today_briefing_ai" }).success).toBe(
      false,
    );
    expect(
      mobileRequestSchema.safeParse({
        requestId,
        kind: "today_briefing",
        authorization: "external_action",
      }).success,
    ).toBe(false);
  });
  it("requires a version and real edits and validates dates", () => {
    expect(mobileEditSchema.safeParse({ requestId, title: "test" }).success).toBe(false);
    expect(
      mobileEditSchema.safeParse({ requestId, expectedUpdatedAt: "2026-09-09T12:00:00.000Z" })
        .success,
    ).toBe(false);
    expect(
      mobileEditSchema.safeParse({
        requestId,
        expectedUpdatedAt: "2026-09-09T12:00:00.000Z",
        dueOn: "2026-02-31",
      }).success,
    ).toBe(false);
  });
});
