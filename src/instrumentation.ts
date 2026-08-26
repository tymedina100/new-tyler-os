import { authConfig } from "@/server/auth/auth-config";

/**
 * Runs once, when a new Next.js server instance starts — never throws.
 *
 * The hard failure for a misconfigured production server is a per-request
 * 503 from `src/proxy.ts`, not this file: `register()` is called during
 * `next build` too (Next's own build step boots a server instance to collect
 * page data), and `next build` must succeed on a machine holding no secrets —
 * see `src/server/env.ts`, which is lazy for the identical reason. Throwing
 * here would fail the build, not just the boot.
 *
 * What this adds on top of the proxy boundary is visibility at the moment the
 * *real* server starts: an operator watching `next start` sees the problem
 * immediately, in the log, rather than discovering it from the first 503.
 * Verified empirically rather than assumed — see docs/VERIFICATION.md 0.7.
 */
export function register(): void {
  if (process.env.NODE_ENV === "development") return;

  const config = authConfig();
  if (config.mode !== "misconfigured") return;

  console.error(
    "[tyleros] starting without a working authentication configuration:\n" +
      config.problems.map((problem) => `  - ${problem}`).join("\n") +
      "\nEvery route except /login, the manifest and the icons will answer 503 until this is fixed.",
  );
}
