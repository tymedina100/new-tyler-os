import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/server/auth/auth-config";
import { isMachineRoute } from "@/server/auth/machine-routes";
import { isPublicRoute } from "@/server/auth/public-routes";
import { SESSION_DURATION_MS, issueSession, verifySession } from "@/server/auth/session";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/server/auth/session-cookie";

/**
 * The authentication boundary. Every request TylerOS serves passes through
 * here first — see docs/DECISIONS.md ADR 030.
 *
 * This is Next's "optimistic check": it reads the cookie and nothing else, per
 * the framework's own guidance ("avoid database checks to prevent performance
 * issues"). There is no database check to avoid — a signed cookie is the whole
 * of what TylerOS knows about a session — but the split still matters: proxy
 * decides whether to serve the page at all, and `runAction` (see
 * `src/server/action-result.ts`) is the second, independent check that runs
 * inside every mutation regardless of how the request reached it.
 *
 * Fails closed, not silently. Three outcomes, and only one of them serves the
 * request:
 * - `misconfigured` (secrets absent outside development) → 503. `next build`
 *   never reaches this function, so this is a runtime failure, not a build one
 *   — see the split in `src/server/auth/auth-config.ts`.
 * - `open` (development with nothing configured) → served, deliberately.
 * - `guarded` with a valid cookie → served, and the cookie is rolled forward
 *   so a session in daily use never silently expires.
 * - `guarded` with no cookie or an invalid one → redirected to `/login`.
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (isPublicRoute(pathname)) return NextResponse.next();
  // Cookie-exempt, not unauthenticated. The handler checks RUNTIME_TOKEN.
  if (isMachineRoute(pathname)) return NextResponse.next();

  // Native human sessions are checked independently in every mobile handler (ADR 040).
  if (pathname === "/api/mobile" || pathname.startsWith("/api/mobile/")) return NextResponse.next();

  const config = authConfig();

  if (config.mode === "misconfigured") {
    console.error(`[tyleros] refusing to serve ${pathname}: ${config.problems.join(" ")}`);
    return new NextResponse("TylerOS is not configured. See the server log.", {
      status: 503,
      headers: { "content-type": "text/plain" },
    });
  }

  if (config.mode === "open") return NextResponse.next();

  const now = Date.now();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const verdict = token ? verifySession(token, config.secret, now) : { valid: false as const };

  if (!verdict.valid) return redirectToLogin(request);

  const response = NextResponse.next();
  const rolled = issueSession(config.secret, now);
  response.cookies.set(
    SESSION_COOKIE_NAME,
    rolled.token,
    sessionCookieOptions(SESSION_DURATION_MS),
  );

  return response;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  const next = `${url.pathname}${url.search}`;

  url.pathname = "/login";
  url.search = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the framework's own asset pipeline. What must stay
  // public from there — the manifest, the icons, /login itself — is decided
  // once, in `isPublicRoute`, not duplicated here as a second matcher pattern.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
