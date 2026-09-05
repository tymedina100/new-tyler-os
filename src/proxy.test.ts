import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config as proxyConfig } from "./proxy";
import { isMachineRoute } from "./server/auth/machine-routes";
import { PUBLIC_ROUTES, isPublicRoute } from "./server/auth/public-routes";

/**
 * The auth boundary's own safety net.
 *
 * `src/proxy.ts` runs before every route this application serves, and lets a
 * request through unguarded only when `isPublicRoute` says so. That is a
 * strong guarantee only as long as nothing quietly narrows the matcher or
 * widens the allowlist. This test discovers every real route on disk — every
 * `page.tsx` and every `route.ts`, present or future — and proves both halves
 * hold for each one: the proxy's matcher actually reaches it, and it is
 * treated as protected unless it is named, with a reason, in
 * `src/server/auth/public-routes.ts`.
 *
 * A route added later needs no change here to stay protected — that is the
 * entire point. This test only fails if the boundary itself regresses: the
 * matcher stops covering a real path, or a personal-data route ends up on the
 * public allowlist.
 */

const APP_DIR = path.join(import.meta.dirname, "app");
const ROUTE_FILES = new Set(["page.tsx", "page.ts", "route.ts", "route.tsx"]);

interface DiscoveredRoute {
  filePath: string;
  pathname: string;
}

function discoverRoutes(dir: string, segments: string[], into: DiscoveredRoute[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      discoverRoutes(fullPath, [...segments, ...urlSegmentFor(entry.name)], into);
      continue;
    }

    if (ROUTE_FILES.has(entry.name)) {
      into.push({
        filePath: fullPath,
        pathname: segments.length === 0 ? "/" : `/${segments.join("/")}`,
      });
    }
  }
}

/** A route group contributes nothing to the URL; a dynamic segment matches
 * anything, and this test only cares about structure, not specific ids. */
function urlSegmentFor(dirName: string): string[] {
  if (dirName.startsWith("(") && dirName.endsWith(")")) return [];
  if (dirName.startsWith("[") && dirName.endsWith("]")) return ["probe-id"];
  return [dirName];
}

function matchesProxyBoundary(pathname: string): boolean {
  return proxyConfig.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

const routes: DiscoveredRoute[] = [];
discoverRoutes(APP_DIR, [], routes);

const publicPaths = new Set(PUBLIC_ROUTES.map((route) => route.path));

describe("the route inventory itself", () => {
  it("actually found the app's routes", () => {
    // A floor, not an exact count: a new route must never need this test
    // edited to keep passing. If this ever reports zero, the walker broke,
    // and every assertion below would otherwise pass by having nothing to
    // check.
    expect(routes.length).toBeGreaterThanOrEqual(10);
  });

  it("found the known shape of today's routes", () => {
    const pathnames = routes.map((route) => route.pathname);
    expect(pathnames).toEqual(
      expect.arrayContaining(["/", "/inbox", "/kitchen", "/search", "/login"]),
    );
  });
});

describe("every discovered route", () => {
  for (const route of routes) {
    const relative = path.relative(APP_DIR, route.filePath);

    it(`${relative} (${route.pathname}) is reached by the proxy's matcher`, () => {
      expect(matchesProxyBoundary(route.pathname)).toBe(true);
    });

    if (!publicPaths.has(route.pathname)) {
      it(`${relative} (${route.pathname}) is not on the public allowlist`, () => {
        expect(isPublicRoute(route.pathname)).toBe(false);
      });
    }
  }
});

describe("the public allowlist", () => {
  it("only contains routes that are actually deliberate", () => {
    // Every entry must carry a real reason — an empty string would pass a
    // naive "is this field present" check but explain nothing to a reviewer.
    for (const route of PUBLIC_ROUTES) {
      expect(route.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not contain a path that swallows the whole application", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.path).not.toBe("/");
      expect(route.path.startsWith("/")).toBe(true);
    }
  });

  it("agrees with isPublicRoute about its own entries", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(isPublicRoute(route.path)).toBe(true);
    }
  });
});

describe("framework-internal paths", () => {
  it("are excluded from the proxy boundary by the matcher, not by the allowlist", () => {
    expect(matchesProxyBoundary("/_next/static/chunk.js")).toBe(false);
    expect(matchesProxyBoundary("/_next/image")).toBe(false);
  });
});

describe("machine runtime routes", () => {
  it("are reached by the matcher and are not on the public allowlist", () => {
    expect(matchesProxyBoundary("/api/runtime/jobs/next")).toBe(true);
    expect(isPublicRoute("/api/runtime/jobs/next")).toBe(false);
    expect(isPublicRoute("/api/runtime/context/today")).toBe(false);
  });

  it("are recognised as machine routes by prefix", () => {
    expect(isMachineRoute("/api/runtime")).toBe(true);
    expect(isMachineRoute("/api/runtime/jobs/next")).toBe(true);
    expect(isMachineRoute("/api/runtime/runs/probe-id/complete")).toBe(true);
    expect(isMachineRoute("/api/runtime/schedules/tick")).toBe(true);
    expect(isMachineRoute("/api/runtime/instances")).toBe(true);
    expect(isMachineRoute("/runs")).toBe(false);
    expect(isMachineRoute("/api/notes")).toBe(false);
  });
});
