import { z } from "zod";

/**
 * Whether TylerOS has an AI proposer, and how to reach it.
 *
 * AI is optional in the strongest sense the codebase can express: with nothing
 * configured, no call is made, no row is written, no UI appears, and every
 * screen behaves exactly as it did in 0.4.1. That is not a degraded mode — it
 * is the mode this application is designed to be excellent in, and the one it
 * ships in until somebody deliberately turns AI on.
 *
 * Configuration is three environment variables and no settings subsystem. A
 * settings table, a preferences screen and a feature-flag service would all be
 * infrastructure built for a single boolean.
 *
 * The key is read here and passed to exactly one function. It is never returned
 * to a caller, never logged, never rendered, and never crosses into a client
 * component — `"use server"` and the layering rules keep this file server-only,
 * and nothing it exports carries the value.
 */

const aiEnvSchema = z.object({
  /**
   * The credential. Absent means AI is off, which is the default state of this
   * repository and of any fresh clone.
   */
  ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
  /**
   * The off switch, for a machine that has a key but does not want to spend it
   * — a development box, or a session where the deterministic behaviour is what
   * is being tested. Anything other than "off" leaves AI enabled.
   */
  AI_SUGGESTIONS: z.string().trim().toLowerCase().optional(),
  /**
   * Which model proposes. Overridable because this fires once per capture, and
   * the cost/quality trade-off on a personal system is the owner's to make, not
   * this file's.
   */
  AI_MODEL: z.string().trim().min(1).optional(),
});

/** Opus by default. Downgrading for cost is a decision, so it is made in `.env`. */
export const DEFAULT_AI_MODEL = "claude-opus-5";

/**
 * Long enough for a small classification, short enough that a stalled provider
 * cannot hold a server task open. Capture has already returned by the time this
 * runs, so the only thing a timeout costs is the suggestion itself.
 */
export const AI_REQUEST_TIMEOUT_MS = 12_000;

/** Why AI is off, when it is. Reported once at startup, never to the user. */
export type AiDisabledReason = "no_api_key" | "switched_off";

export type AiConfig =
  { enabled: false; reason: AiDisabledReason } | { enabled: true; apiKey: string; model: string };

let cached: AiConfig | undefined;

/**
 * Lazy and memoised, for the same reason `serverEnv` is: `next build` must
 * succeed on a machine with nothing configured, and this must never be the
 * reason a page fails to render.
 */
export function aiConfig(): AiConfig {
  if (cached) return cached;

  // A malformed value is treated as absent rather than fatal. An optional
  // subsystem must not be able to take the application down on boot.
  const parsed = aiEnvSchema.safeParse(process.env);
  const env = parsed.success ? parsed.data : {};

  cached = resolve(env);
  return cached;
}

function resolve(env: Partial<z.infer<typeof aiEnvSchema>>): AiConfig {
  if (env.AI_SUGGESTIONS === "off") return { enabled: false, reason: "switched_off" };
  if (!env.ANTHROPIC_API_KEY) return { enabled: false, reason: "no_api_key" };

  return {
    enabled: true,
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.AI_MODEL ?? DEFAULT_AI_MODEL,
  };
}

/** Test seam. Nothing in the application calls this. */
export function resetAiConfigForTests(): void {
  cached = undefined;
}
