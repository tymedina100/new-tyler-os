/**
 * Routes a machine runtime may call without a session cookie.
 *
 * Cookie auth is for Tyler. These paths are for a process acting as a role,
 * authenticated with `RUNTIME_TOKEN` inside the route handler. They are not
 * public: `src/proxy.ts` skips the cookie here so a worker is not sent to
 * `/login`, and skips the human-auth 503 so a missing passphrase cannot
 * take the machine API down with it. Bearer checking is the handler's job.
 *
 * Kept as a prefix rather than a list of endpoints so a later heartbeat or
 * context route inherits the exception without a second allowlist. See ADR 035.
 */

export const MACHINE_ROUTE_PREFIX = "/api/runtime";

export function isMachineRoute(pathname: string): boolean {
  return pathname === MACHINE_ROUTE_PREFIX || pathname.startsWith(`${MACHINE_ROUTE_PREFIX}/`);
}
