/**
 * The complete list of routes that must work without a session.
 *
 * Kept as data, not scattered `if` statements, for one reason: this file is
 * read by two things that must never disagree — `src/proxy.ts`, which lets
 * these paths through, and `src/proxy.test.ts`, which asserts that every other
 * route in `src/app/` is covered by the proxy. If a route is added to this list
 * without a reason, the test still passes; if a personal-data route is added
 * here by mistake, only a human reading this file catches it. That is why the
 * list is short and every entry is commented.
 */

export interface PublicRoute {
  /** Exact pathname, or a prefix ending in "/" matched by startsWith. */
  path: string;
  reason: string;
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: "/login", reason: "where an unauthenticated visitor is sent" },

  // The PWA manifest and icons must load before a session exists — a phone
  // reads them to decide whether the app is installable, and the browser tab
  // reads the icon on the login page itself. Next serves a code-generated
  // icon.tsx/apple-icon.tsx at these exact paths, not at their source
  // filenames — see src/app/icon.tsx.
  { path: "/manifest.webmanifest", reason: "app manifest, read before install" },
  { path: "/icon", reason: "tab icon and the manifest's own install icon" },
  { path: "/apple-icon", reason: "iOS home-screen icon" },
  { path: "/favicon.ico", reason: "browser default icon lookup, harmless if unused" },
];

/** Framework-internal paths. Never application routes, never personal data. */
const FRAMEWORK_PREFIXES = ["/_next/"];

export function isPublicRoute(pathname: string): boolean {
  if (FRAMEWORK_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;

  return PUBLIC_ROUTES.some(
    (route) => pathname === route.path || pathname.startsWith(`${route.path}/`),
  );
}
