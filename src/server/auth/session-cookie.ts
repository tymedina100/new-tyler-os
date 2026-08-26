import { cookies } from "next/headers";
import { authConfig } from "@/server/auth/auth-config";
import { issueSession, SESSION_DURATION_MS, verifySession } from "@/server/auth/session";

/**
 * The one cookie TylerOS sets.
 *
 * `HttpOnly` so client JavaScript can never read it, `SameSite=Lax` because
 * this is a same-site application with no third-party embedding to defend
 * against beyond what Lax already stops, and `Secure` in every environment
 * except development, where a plain `http://localhost` would otherwise refuse
 * to send it at all. `Path=/` because there is exactly one application behind
 * it, not a `/app` mounted beside something else.
 *
 * Expiry is rolling: every request that carries a still-valid cookie is
 * re-issued a new one with a fresh thirty-day window, in `src/proxy.ts`. That
 * file cannot import `next/headers` — it runs before the request is routed,
 * where only the request/response cookie APIs exist — so `sessionCookieOptions`
 * is exported here and reused there, and the two are the only places this
 * shape is written.
 */

export const SESSION_COOKIE_NAME = "tyleros_session";

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

export function sessionCookieOptions(maxAgeMs: number): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

/**
 * Sets the session cookie from a Server Action, where `cookies()` is
 * writable. Never called from a Server Component render — Next forbids it
 * there, and `src/proxy.ts` is where a request-time rolling refresh belongs
 * instead.
 */
export async function createSessionCookie(now: number): Promise<void> {
  const config = authConfig();
  if (config.mode !== "guarded") return;

  const { token } = issueSession(config.secret, now);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(SESSION_DURATION_MS));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/**
 * Reads and verifies the cookie from a Server Component or Server Action,
 * where `cookies()` is read-only. Returns whether the request is authenticated
 * — nothing more, because there is nothing else to know about the one subject
 * this application has.
 */
export async function hasValidSession(now: number): Promise<boolean> {
  const config = authConfig();
  if (config.mode !== "guarded") return config.mode === "open";

  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;

  return verifySession(token, config.secret, now).valid;
}
