import { z } from "zod";

/**
 * Whether TylerOS is guarded, and with what.
 *
 * Shaped like `ai-config.ts`: read lazily, memoised, and returning a closed
 * union rather than throwing at import time. The difference is which way it
 * fails. An absent AI key means one optional feature is off. An absent
 * passphrase outside development means the application must not serve personal
 * data at all — so this module reports `misconfigured` and the boundary in
 * `src/proxy.ts` turns that into a refusal.
 *
 * Nothing here throws, and nothing here runs at import time. `next build` must
 * succeed on a machine that holds no secrets — the same reason `env.ts` is lazy
 * — while a production server started without them must serve nothing. Those
 * two requirements are only compatible if the check happens per request, which
 * is why the decision lives in a function and the refusal lives at the
 * boundary. See docs/DECISIONS.md ADR 030.
 */

/**
 * A 32-character secret is 256 bits only if the characters are unpredictable,
 * which is why `openssl rand -base64 32` is what the documentation tells you to
 * run rather than "pick something long". The distinct-character floor below is
 * what stops `aaaa…` and `abababab…` from passing the length test.
 */
const MIN_SECRET_LENGTH = 32;

/**
 * A passphrase is typed on a phone keyboard, so it cannot be held to the same
 * length as a generated secret. Sixteen characters of something memorable, in
 * front of a private application on a domain nobody is told about, is the
 * trade-off being made here — knowingly. It is not protecting a bank.
 */
const MIN_PASSPHRASE_LENGTH = 16;

const MIN_DISTINCT_CHARACTERS = 8;

/**
 * Values that are long enough to pass every other test and still mean "I have
 * not set this yet". Includes the placeholders this repository's own
 * `.env.example` suggests, because a copied template is the likeliest way a
 * weak value arrives.
 */
const PLACEHOLDERS = new Set([
  "changeme",
  "change-me",
  "changemechangemechangeme",
  "letmein",
  "password",
  "passphrase",
  "secret",
  "session_secret",
  "replace-me",
  "replace-this-with-a-real-secret",
  "your-secret-here",
  "your_secret_here",
  "tyleros",
  "tyleros-passphrase",
  "correct-horse-battery-staple",
]);

const rawAuthEnvSchema = z.object({
  AUTH_PASSPHRASE: z.string().trim().optional(),
  SESSION_SECRET: z.string().trim().optional(),
});

export type AuthConfig =
  | { mode: "guarded"; passphrase: string; secret: string }
  | { mode: "open" }
  | { mode: "misconfigured"; problems: readonly string[] };

export interface AuthEnvironment {
  AUTH_PASSPHRASE?: string | undefined;
  SESSION_SECRET?: string | undefined;
  isDevelopment: boolean;
}

/**
 * The whole decision, as a pure function, so every branch is a one-line test.
 *
 * Strength is enforced identically in development and in production. There is no
 * softer development rule because there does not need to be one: development
 * with nothing configured is already open, so the only person who sets a
 * passphrase locally is someone deliberately exercising the guard, and they can
 * paste a real one.
 */
export function describeAuthConfig(environment: AuthEnvironment): AuthConfig {
  const parsed = rawAuthEnvSchema.safeParse(environment);
  const passphrase = parsed.success ? orUndefined(parsed.data.AUTH_PASSPHRASE) : undefined;
  const secret = parsed.success ? orUndefined(parsed.data.SESSION_SECRET) : undefined;

  if (!passphrase && !secret) {
    if (environment.isDevelopment) return { mode: "open" };
    return {
      mode: "misconfigured",
      problems: [
        "AUTH_PASSPHRASE is not set, so there is no way to sign in.",
        "SESSION_SECRET is not set, so no session could be signed.",
      ],
    };
  }

  // Half-configured is worse than unconfigured: it looks guarded and is not.
  // Reported the same way in development, where the fix is the same.
  const problems: string[] = [];

  if (!passphrase) {
    problems.push("AUTH_PASSPHRASE is not set, but SESSION_SECRET is. Set both, or neither.");
  } else {
    problems.push(...weaknesses("AUTH_PASSPHRASE", passphrase, MIN_PASSPHRASE_LENGTH));
  }

  if (!secret) {
    problems.push("SESSION_SECRET is not set, but AUTH_PASSPHRASE is. Set both, or neither.");
  } else {
    problems.push(...weaknesses("SESSION_SECRET", secret, MIN_SECRET_LENGTH));
  }

  if (!passphrase || !secret || problems.length > 0) {
    return { mode: "misconfigured", problems };
  }

  return { mode: "guarded", passphrase, secret };
}

function weaknesses(label: string, value: string, minLength: number): string[] {
  if (value.length < minLength) {
    return [
      `${label} is ${value.length} characters long; it must be at least ${minLength}. ` +
        `Generate one with: openssl rand -base64 32`,
    ];
  }

  const distinct = new Set(value).size;

  if (distinct < MIN_DISTINCT_CHARACTERS) {
    return [
      `${label} is long enough but uses only ${distinct} distinct characters, ` +
        `so its length is not real entropy. Generate one with: openssl rand -base64 32`,
    ];
  }

  if (PLACEHOLDERS.has(value.toLowerCase())) {
    return [`${label} is still a placeholder value. Generate one with: openssl rand -base64 32`];
  }

  return [];
}

function orUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

let cached: AuthConfig | undefined;

/** The memoised configuration for this process. */
export function authConfig(): AuthConfig {
  cached ??= describeAuthConfig({
    AUTH_PASSPHRASE: process.env.AUTH_PASSPHRASE,
    SESSION_SECRET: process.env.SESSION_SECRET,
    isDevelopment: process.env.NODE_ENV === "development",
  });

  return cached;
}
