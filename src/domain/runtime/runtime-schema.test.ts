import { describe, expect, it } from "vitest";
import { completeRunSchema, createNoteProposalSchema, runUsageSchema } from "./runtime-schema";

describe("completeRunSchema", () => {
  it("accepts a successful observe completion with a note proposal", () => {
    const parsed = completeRunSchema.parse({
      status: "succeeded",
      resultSummary: "  Drafted today's briefing.  ",
      proposal: {
        kind: "create_note",
        title: "Today briefing — 4 Sep 2026",
        body: "## Overdue\n- Pay rent",
      },
    });

    expect(parsed.resultSummary).toBe("Drafted today's briefing.");
    expect(parsed.proposal?.kind).toBe("create_note");
  });

  it("refuses a proposal that is not a create_note", () => {
    const parsed = completeRunSchema.safeParse({
      status: "succeeded",
      proposal: { kind: "send_email", title: "Hi", body: "Hello" },
    });

    expect(parsed.success).toBe(false);
  });

  it("treats blank usage as absent rather than zero", () => {
    const parsed = runUsageSchema.parse({
      provider: "  ",
      model: "",
      inputTokens: undefined,
    });

    expect(parsed).toEqual({
      provider: null,
      model: null,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
    });
  });
});

describe("createNoteProposalSchema", () => {
  it("refuses an empty title", () => {
    const parsed = createNoteProposalSchema.safeParse({
      kind: "create_note",
      title: "   ",
      body: "Something",
    });

    expect(parsed.success).toBe(false);
  });
});
