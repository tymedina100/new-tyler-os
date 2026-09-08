import { describe, expect, it } from "vitest";
import { createAiExecutionProfileSchema, enqueueTodayBriefingAiSchema } from "./ai-profile-schema";

describe("createAiExecutionProfileSchema", () => {
  it("requires an explicit provider and model", () => {
    const parsed = createAiExecutionProfileSchema.safeParse({
      key: "miles-briefing-primary",
      name: "Miles Briefing Primary",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown provider instead of routing to one", () => {
    const parsed = createAiExecutionProfileSchema.safeParse({
      key: "miles-briefing-primary",
      name: "Miles Briefing Primary",
      provider: "openai",
      model: "gpt-5",
    });
    expect(parsed.success).toBe(false);
  });

  it("does not accept an API key field", () => {
    const parsed = createAiExecutionProfileSchema.safeParse({
      key: "miles-briefing-primary",
      name: "Miles Briefing Primary",
      provider: "anthropic",
      model: "claude-opus-5",
      apiKey: "sk-ant-secret",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an explicit anthropic profile", () => {
    const parsed = createAiExecutionProfileSchema.parse({
      key: "miles-briefing-primary",
      name: "Miles Briefing Primary",
      provider: "anthropic",
      model: "claude-opus-5",
      poolKey: "anthropic-api-payg",
    });
    expect(parsed.provider).toBe("anthropic");
    expect(parsed.model).toBe("claude-opus-5");
    expect(parsed.poolKey).toBe("anthropic-api-payg");
    expect("apiKey" in parsed).toBe(false);
  });
});

describe("enqueueTodayBriefingAiSchema", () => {
  it("requires an explicit profile id and does not default one", () => {
    expect(enqueueTodayBriefingAiSchema.safeParse({}).success).toBe(false);
    expect(enqueueTodayBriefingAiSchema.safeParse({ profileId: "" }).success).toBe(false);
  });
});
