import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthConfig } from "@/server/auth/auth-config";
import type { Database } from "@/server/db/client";
import * as repo from "./mobile-repository";

export class MobileHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export const MOBILE_SESSION_MS = 7 * 24 * 60 * 60_000;
export function hashMobileValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function guarded(config: AuthConfig) {
  if (config.mode !== "guarded")
    throw new MobileHttpError(503, "unavailable", "Mobile access is not configured.");
  return config;
}
function fingerprint(config: Extract<AuthConfig, { mode: "guarded" }>) {
  return hashMobileValue(JSON.stringify(["mobile-v1", config.secret, config.passphrase]));
}
export async function createMobileSession(
  db: Database,
  config: AuthConfig,
  passphrase: string,
  now = new Date(),
) {
  const credentials = guarded(config);
  if (!(await repo.takeLoginAttempt(db, now)))
    throw new MobileHttpError(
      429,
      "rate_limited",
      "Too many sign-in attempts. Try again in 15 minutes.",
    );
  const matches = timingSafeEqual(
    Buffer.from(hashMobileValue(passphrase)),
    Buffer.from(hashMobileValue(credentials.passphrase)),
  );
  if (!matches) throw new MobileHttpError(401, "unauthorized", "Incorrect passphrase.");
  const token = `tym1_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + MOBILE_SESSION_MS);
  await repo.insertSession(db, hashMobileValue(token), fingerprint(credentials), expiresAt);
  return { token, expiresAt: expiresAt.toISOString() };
}
export async function requireMobileSession(
  db: Database,
  config: AuthConfig,
  authorization: string | null,
  now = new Date(),
) {
  const credentials = guarded(config);
  const match = /^Bearer (tym1_[A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
  if (
    !match ||
    !(await repo.hasSession(db, hashMobileValue(match[1]!), fingerprint(credentials), now))
  ) {
    throw new MobileHttpError(401, "unauthorized", "Sign in to TylerOS again.");
  }
  return hashMobileValue(match[1]!);
}
