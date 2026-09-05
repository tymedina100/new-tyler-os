/**
 * Runtime instances, capabilities, and health.
 *
 * An instance is infrastructure: Home Desktop Python is not Miles. Capabilities
 * are technical (deterministic, browser) so a later router has facts, not a
 * ranking engine. Health is derived from lastSeenAt. See ADR 037.
 */

import type { Role, RuntimeKind, RuntimeStatus } from "./runtime";

export const RUNTIME_CAPABILITIES = [
  "deterministic",
  "browser",
  "code",
  "research",
  "external_api",
] as const;
export type RuntimeCapability = (typeof RUNTIME_CAPABILITIES)[number];

export const RUNTIME_HEALTHS = ["healthy", "stale", "offline", "disabled"] as const;
export type RuntimeHealth = (typeof RUNTIME_HEALTHS)[number];

/** Last seen within this window is healthy. Matches the observe lease. */
export const RUNTIME_HEALTHY_WITHIN_MS = 2 * 60 * 1000;

/** After healthy, until this window, the instance is stale rather than offline. */
export const RUNTIME_STALE_WITHIN_MS = 10 * 60 * 1000;

export const INSTANCE_KEY_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;

export const RUNTIME_CAPABILITY_LABELS: Record<RuntimeCapability, string> = {
  deterministic: "Deterministic",
  browser: "Browser",
  code: "Code",
  research: "Research",
  external_api: "External API",
};

export const RUNTIME_HEALTH_LABELS: Record<RuntimeHealth, string> = {
  healthy: "Healthy",
  stale: "Stale",
  offline: "Offline",
  disabled: "Disabled",
};

export interface RuntimeGrant {
  runtimeId: string;
  role: Role;
}

export interface BootstrapRuntimeInput {
  instanceKey: string;
  name: string;
  kind: RuntimeKind;
  deviceId?: string | null;
  capabilities?: readonly RuntimeCapability[];
  roles?: readonly Role[];
  status?: RuntimeStatus;
}

export function isRuntimeCapability(value: string): value is RuntimeCapability {
  return (RUNTIME_CAPABILITIES as readonly string[]).includes(value);
}

export function defaultCapabilitiesFor(kind: RuntimeKind): RuntimeCapability[] {
  switch (kind) {
    case "python":
      return ["deterministic"];
    case "cursor":
      return ["code", "deterministic"];
    case "grok_bot":
      return ["research"];
    case "chatgpt":
    case "claude":
    case "gemini":
      return ["research", "code"];
    case "api":
      return ["external_api", "deterministic"];
  }
}
