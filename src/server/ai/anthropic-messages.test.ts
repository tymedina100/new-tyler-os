import { afterEach, describe, expect, it, vi } from "vitest";
import { requestMessage } from "./anthropic-messages";

describe("requestMessage usage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records provider token counts from a successful Messages response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: "claude-opus-5",
              stop_reason: "end_turn",
              content: [
                {
                  type: "text",
                  text: '{"summary":"ok","priorities":[],"needsTyler":[],"watch":[]}',
                },
              ],
              usage: { input_tokens: 1234, output_tokens: 182, cache_read_input_tokens: 10 },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    const result = await requestMessage(
      { apiKey: "sk-ant-test", model: "claude-opus-5" },
      { system: "sys", prompt: "hi", maxTokens: 64 },
    );

    expect(result).toMatchObject({
      ok: true,
      model: "claude-opus-5",
      usage: { inputTokens: 1234, cachedInputTokens: 10, outputTokens: 182 },
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      headers: expect.not.objectContaining({ "x-api-key": undefined }),
    });
  });

  it("keeps known usage when the model truncates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: "claude-opus-5",
              stop_reason: "max_tokens",
              content: [{ type: "text", text: "{" }],
              usage: { input_tokens: 40, output_tokens: 8 },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    const result = await requestMessage(
      { apiKey: "sk-ant-test", model: "claude-opus-5" },
      { system: "sys", prompt: "hi", maxTokens: 64 },
    );
    expect(result).toMatchObject({
      ok: false,
      failure: "truncated",
      usage: { inputTokens: 40, outputTokens: 8 },
    });
  });

  it("maps 401 to unauthorized without throwing the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { type: "authentication_error", message: "sk-ant-test" } }),
            {
              status: 401,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );

    const result = await requestMessage(
      { apiKey: "sk-ant-test", model: "claude-opus-5" },
      { system: "sys", prompt: "hi", maxTokens: 64 },
    );
    expect(result).toEqual({ ok: false, failure: "unauthorized", usage: null });
  });
});
