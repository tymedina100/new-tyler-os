import { describe, expect, it } from "vitest";
import { issueSession, passphraseMatches, verifySession } from "./session";

const SECRET = "a-test-secret-that-is-long-enough-1234";
const OTHER_SECRET = "a-different-secret-that-is-also-long-1";
const NOW = new Date(2026, 7, 26).getTime();

describe("issueSession / verifySession", () => {
  it("verifies a token it just issued", () => {
    const { token } = issueSession(SECRET, NOW);
    expect(verifySession(token, SECRET, NOW)).toEqual({
      valid: true,
      expiresAt: expect.any(Number),
    });
  });

  it("issues two different tokens for two calls at the same instant", () => {
    // Only the nonce differs; nothing depends on it being unique, but a
    // deterministic token would be a symptom of forgetting to include it.
    const first = issueSession(SECRET, NOW);
    const second = issueSession(SECRET, NOW);
    expect(first.token).not.toBe(second.token);
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = issueSession(OTHER_SECRET, NOW);
    expect(verifySession(token, SECRET, NOW)).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects a token whose body was tampered with", () => {
    const { token } = issueSession(SECRET, NOW);
    const [version, , nonce, signature] = token.split(".");
    // Swap in a later expiry than the one that was actually signed.
    const forgedExpiry = (NOW + 1000 * 365 * 24 * 60 * 60 * 1000).toString(36);
    const forged = `${version}.${forgedExpiry}.${nonce}.${signature}`;

    expect(verifySession(forged, SECRET, NOW)).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects a token whose signature was tampered with", () => {
    const { token } = issueSession(SECRET, NOW);
    const tampered = token.slice(0, -4) + "XXXX";

    expect(verifySession(tampered, SECRET, NOW).valid).toBe(false);
  });

  it("rejects an expired token", () => {
    const { token, expiresAt } = issueSession(SECRET, NOW);
    expect(verifySession(token, SECRET, expiresAt + 1)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("accepts a token at the instant before its expiry", () => {
    const { token, expiresAt } = issueSession(SECRET, NOW);
    expect(verifySession(token, SECRET, expiresAt - 1).valid).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(verifySession("not-a-token", SECRET, NOW)).toEqual({
      valid: false,
      reason: "malformed",
    });
    expect(verifySession("", SECRET, NOW)).toEqual({ valid: false, reason: "malformed" });
  });

  it("rejects an unknown token version", () => {
    const { token } = issueSession(SECRET, NOW);
    const rest = token.split(".").slice(1).join(".");
    expect(verifySession(`v99.${rest}`, SECRET, NOW)).toEqual({
      valid: false,
      reason: "unknown_version",
    });
  });
});

describe("passphraseMatches", () => {
  it("matches the same passphrase", () => {
    expect(passphraseMatches("correct-passphrase", "correct-passphrase", SECRET)).toBe(true);
  });

  it("rejects a different passphrase", () => {
    expect(passphraseMatches("correct-passphrase", "wrong-passphrase", SECRET)).toBe(false);
  });

  it("rejects a passphrase that differs only in case", () => {
    expect(passphraseMatches("Correct-Passphrase", "correct-passphrase", SECRET)).toBe(false);
  });

  it("rejects an empty submission against a real passphrase", () => {
    expect(passphraseMatches("correct-passphrase", "", SECRET)).toBe(false);
  });

  it("does not throw when the submitted value has a different length", () => {
    // The naive version of this check (`timingSafeEqual` on the raw strings)
    // throws on a length mismatch, which is exactly the shortcut that leaks
    // information. Hashing first is what this test guards.
    expect(() => passphraseMatches("correct-passphrase", "x", SECRET)).not.toThrow();
  });
});
