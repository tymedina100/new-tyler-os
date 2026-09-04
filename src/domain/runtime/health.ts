import { RUNTIME_HEALTHY_WITHIN_MS, RUNTIME_STALE_WITHIN_MS, type RuntimeHealth } from "./fleet";
import type { RuntimeStatus } from "./runtime";

/**
 * Presence from lastSeenAt. Not a stored column, not an alert.
 *
 * A poll that authenticates is real activity. Disabled always wins over a
 * recent heartbeat so a paused worker cannot look healthy.
 */

export function deriveRuntimeHealth(
  status: RuntimeStatus,
  lastSeenAt: Date | null,
  now: Date,
  healthyWithinMs = RUNTIME_HEALTHY_WITHIN_MS,
  staleWithinMs = RUNTIME_STALE_WITHIN_MS,
): RuntimeHealth {
  if (status !== "enabled") return "disabled";
  if (lastSeenAt === null) return "offline";

  const age = now.getTime() - lastSeenAt.getTime();
  if (age <= healthyWithinMs) return "healthy";
  if (age <= staleWithinMs) return "stale";
  return "offline";
}

export function formatLastSeen(lastSeenAt: Date | null, now: Date): string {
  if (lastSeenAt === null) return "Never seen";

  const seconds = Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000));
  if (seconds < 60) return `Last seen ${seconds} sec ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Last seen ${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Last seen ${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return `Last seen ${days} days ago`;
}
