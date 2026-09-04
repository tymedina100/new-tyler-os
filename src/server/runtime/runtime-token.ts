import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Whether the machine runtime API is on, and with what token.
 *
 * Shaped like `auth-config.ts`: lazy, memoised, a closed union, nothing
 * thrown at import time. The failure mode is different. A missing passphrase
 * in development leaves the human app open. A missing `RUNTIME_TOKEN`
 * turns the machine API off even then — a worker must never ride the
 * open-dev cookie exemption. See ADR 035.
 */

const MIN_TOKEN_LENGTH = 32;
const MIN_DISTINCT_CHARACTERS = 8;

const PLACEHOLDERS = new Set([
  "changeme",
  "change-me",
  "changemechangemechangeme",
  "letmein",
  "password",
  "passphrase",
  "secret",
  "runtime_token",
  "replace-me",
  "replace-this-with-a-real-secret",
  "your-secret-here",
  "your_secret_here",
  "tyleros",
  "tyleros-runtime-token",
]);

const rawRuntimeEnvSchema = z.object({
  RUNTIME_TOKEN: z.string().trim().optional(),
});

export type RuntimeTokenConfig = { mode: "off"; reason: string } | { mode: "on"; token: string };

export interface RuntimeTokenEnvironment {
  RUNTIME_TOKEN?: string | undefined;
}

export function describeRuntimeToken(environment: RuntimeTokenEnvironment): RuntimeTokenConfig {
  const parsed = rawRuntimeEnvSchema.safeParse(environment);
  const token = parsed.success ? orUndefined(parsed.data.RUNTIME_TOKEN) : undefined;

  if (!token) {
    return {
      mode: "off",
      reason: "RUNTIME_TOKEN is not set, so the machine API is off.",
    };
  }

  const problems = weaknesses(token);
  if (problems.length > 0) {
    return { mode: "off", reason: problems.join(" ") };
  }

  return { mode: "on", token };
}

export function presentedTokenMatches(expected: string, presented: string): boolean {
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(presented).digest();
  return timingSafeEqual(a, b);
}

export function hashRuntimeSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateRuntimeCredential(): string {
  return `tylrt_${randomBytes(32).toString("base64url")}`;
}

function weaknesses(value: string): string[] {
  if (value.length < MIN_TOKEN_LENGTH) {
    return [
      `RUNTIME_TOKEN is ${value.length} characters long; it must be at least ${MIN_TOKEN_LENGTH}. ` +
        `Generate one with: openssl rand -base64 32`,
    ];
  }

  const distinct = new Set(value).size;
  if (distinct < MIN_DISTINCT_CHARACTERS) {
    return [
      `RUNTIME_TOKEN is long enough but uses only ${distinct} distinct characters, ` +
        `so its length is not real entropy. Generate one with: openssl rand -base64 32`,
    ];
  }

  if (PLACEHOLDERS.has(value.toLowerCase())) {
    return [
      `RUNTIME_TOKEN is still a placeholder value. Generate one with: openssl rand -base64 32`,
    ];
  }

  return [];
}

function orUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

let cached: RuntimeTokenConfig | undefined;

export function runtimeTokenConfig(): RuntimeTokenConfig {
  cached ??= describeRuntimeToken({ RUNTIME_TOKEN: process.env.RUNTIME_TOKEN });
  return cached;
}
