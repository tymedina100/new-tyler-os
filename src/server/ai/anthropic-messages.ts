import { z } from "zod";
import { AI_REQUEST_TIMEOUT_MS } from "./ai-config";

/**
 * The provider boundary. The only file in TylerOS that knows a provider exists.
 *
 * One endpoint, one non-streaming request, no SDK. `@anthropic-ai/sdk` was
 * considered and rejected: this makes a single `POST /v1/messages` with a small
 * JSON body, which `fetch` does natively on Node 22, and the SDK's headline
 * feature here — automatic retries — is the opposite of what an optional
 * suggestion wants. A failed proposal should cost nothing and quietly stop, not
 * re-bill twice on its own initiative. See ADR 026.
 *
 * Everything above this file is provider-agnostic. `classify-capture.ts` builds
 * a prompt and reads text; the service knows only a function type. Nothing in
 * `src/domain/` or `src/components/` can see any of it.
 *
 * **The key never leaves this function.** It arrives as an argument, goes into
 * one header, and is not stored, returned, logged or included in any error. The
 * failure taxonomy below is deliberately coarse for the same reason: every
 * value is safe to write to a log.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Why a request produced nothing. Every one of these ends the same way — no
 * suggestion — and the distinction exists only to make a server log readable.
 */
export type ProviderFailure =
  | "timeout"
  | "network"
  | "rate_limited"
  | "client_error"
  | "server_error"
  | "refused"
  | "truncated"
  | "empty_response";

export type ProviderResult =
  | { ok: true; text: string; model: string }
  | { ok: false; failure: ProviderFailure };

export interface ProviderRequest {
  system: string;
  prompt: string;
  maxTokens: number;
}

/**
 * What the response envelope is allowed to look like.
 *
 * Validated rather than cast, because a provider response is external input
 * like any other. `.loose()` on the blocks: unfamiliar block types are ignored
 * rather than rejected, so a future addition to the response format cannot
 * break a subsystem that only ever wanted the text.
 */
const messageResponseSchema = z.object({
  model: z.string().optional(),
  stop_reason: z.string().nullish(),
  content: z
    .array(z.looseObject({ type: z.string(), text: z.string().optional() }))
    .optional()
    .default([]),
});

/** Only the error *type* is read. Provider error bodies are never logged whole. */
const errorResponseSchema = z.object({
  error: z.looseObject({ type: z.string().optional() }).optional(),
});

export async function requestMessage(
  credentials: { apiKey: string; model: string },
  request: ProviderRequest,
): Promise<ProviderResult> {
  let response: Response;

  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": credentials.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: credentials.model,
        max_tokens: request.maxTokens,
        system: request.system,
        // Effort is the cost dial. This is a short classification against a
        // closed vocabulary, not a problem that rewards deliberation.
        output_config: { effort: "low" },
        messages: [{ role: "user", content: request.prompt }],
      }),
      // A stalled provider must not hold a background task open indefinitely.
      // Capture has already returned by the time this runs, so a timeout costs
      // the suggestion and nothing else.
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Not swallowed — classified, and reported to the caller, which logs it.
    // The error is deliberately not attached: a fetch failure can carry the
    // request in its message, and the request carries the key.
    return { ok: false, failure: isTimeout(error) ? "timeout" : "network" };
  }

  if (!response.ok) return { ok: false, failure: await classifyHttpFailure(response) };

  const parsed = messageResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) return { ok: false, failure: "empty_response" };

  const message = parsed.data;

  // A safety decline is an HTTP 200 with nothing usable in it. For an optional
  // classification the right answer is simply no suggestion, so no fallback
  // model is configured — a second paid attempt to label "buy cilantro" would
  // be spending money to avoid an outcome that costs the user nothing.
  if (message.stop_reason === "refusal") return { ok: false, failure: "refused" };
  // A truncated object would fail JSON parsing downstream anyway. Naming it
  // here is what makes "raise max_tokens" findable in a log.
  if (message.stop_reason === "max_tokens") return { ok: false, failure: "truncated" };

  const text = message.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  if (text.length === 0) return { ok: false, failure: "empty_response" };

  return { ok: true, text, model: message.model ?? credentials.model };
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * HTTP status to a loggable category.
 *
 * The body is read only for the provider's own `error.type`, which is a short
 * machine string like `invalid_request_error`. The rest of the body is
 * discarded unread: an error response can echo the request that caused it.
 */
async function classifyHttpFailure(response: Response): Promise<ProviderFailure> {
  if (response.status === 429) return "rate_limited";

  // Drained regardless, so the connection is not left holding a body nobody
  // wants. The type is not used to change behaviour, only to be reportable.
  const parsed = errorResponseSchema.safeParse(await readJson(response));
  if (parsed.success && parsed.data.error?.type === "rate_limit_error") return "rate_limited";

  return response.status >= 500 ? "server_error" : "client_error";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // A non-JSON body from a JSON API is a failure like any other, and there is
    // nothing in it worth propagating. The caller has already decided that an
    // unreadable response means no suggestion.
    return null;
  }
}
