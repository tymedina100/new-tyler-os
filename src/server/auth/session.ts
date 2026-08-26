import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The session token, and the two constant-time comparisons TylerOS makes.
 *
 * A signed cookie rather than a stored session, because there is nothing to
 * store: one subject, no roles, no revocation list worth a table. The token
 * carries an expiry and a nonce and no identity at all — naming the only user
 * there is would record a fact, not establish one.
 *
 * `node:crypto` rather than a library. Proxy runs on the Node.js runtime in
 * Next 16, so HMAC-SHA256 is available at the boundary and at every other
 * layer, and this file is short enough to read in one sitting. That is the same
 * reasoning ADR 026 used to make one HTTPS call instead of adding an SDK.
 * See docs/DECISIONS.md ADR 030.
 *
 * `now` is always an argument. Ambient time makes a token that expires in
 * thirty days untestable except by waiting thirty days.
 */

const TOKEN_VERSION = "v1";

/**
 * Thirty days, refreshed on use. Long, on purpose: the alternative is being
 * logged out of your own life at a traffic light. The mitigation for a stolen
 * phone is the phone's own lock screen, not a short cookie.
 */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedSession {
  token: string;
  expiresAt: number;
}

export type SessionVerdict =
  | { valid: true; expiresAt: number }
  | { valid: false; reason: "malformed" | "unknown_version" | "bad_signature" | "expired" };

export function issueSession(secret: string, now: number): IssuedSession {
  const expiresAt = now + SESSION_DURATION_MS;
  // The nonce makes two sessions issued in the same millisecond different
  // tokens. Nothing depends on it being unique; it just stops a cookie from
  // being a function of its expiry alone.
  const body = `${TOKEN_VERSION}.${expiresAt.toString(36)}.${randomBytes(16).toString("base64url")}`;

  return { token: `${body}.${sign(secret, body)}`, expiresAt };
}

/**
 * The signature is checked before the expiry is believed. An expiry read out of
 * an unverified token is an attacker's number.
 */
export function verifySession(token: string, secret: string, now: number): SessionVerdict {
  const parts = token.split(".");

  if (parts.length !== 4) return { valid: false, reason: "malformed" };

  const [version, encodedExpiry, nonce, signature] = parts;

  if (version !== TOKEN_VERSION) return { valid: false, reason: "unknown_version" };
  if (!encodedExpiry || !nonce || !signature) return { valid: false, reason: "malformed" };

  const body = `${version}.${encodedExpiry}.${nonce}`;

  if (!constantTimeEquals(sign(secret, body), signature)) {
    return { valid: false, reason: "bad_signature" };
  }

  const expiresAt = Number.parseInt(encodedExpiry, 36);

  if (!Number.isSafeInteger(expiresAt)) return { valid: false, reason: "malformed" };
  if (expiresAt <= now) return { valid: false, reason: "expired" };

  return { valid: true, expiresAt };
}

/**
 * Compares the submitted passphrase with the configured one in constant time,
 * and without leaking its length: both sides are put through the same HMAC
 * first, so the strings actually compared are always 43 characters whatever was
 * typed. `timingSafeEqual` throws on a length mismatch, which is exactly the
 * comparison a naive implementation would leak.
 */
export function passphraseMatches(expected: string, submitted: string, secret: string): boolean {
  return constantTimeEquals(sign(secret, expected), sign(secret, submitted));
}

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function constantTimeEquals(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");

  // Both callers compare two HMAC digests, so unequal lengths mean a malformed
  // token rather than a near miss, and returning early leaks nothing secret.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
