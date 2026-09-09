import { DomainError } from "@/domain/shared/errors";
import { bootstrapRuntimeSchema } from "./fleet-schema";
import type { RuntimeCapability } from "./fleet";
import type { Role, Runtime } from "./runtime";

export const MOBILE_RUNTIME_INPUT = bootstrapRuntimeSchema.parse({
  instanceKey: "mobile-companion-python",
  name: "Mobile Companion Python",
  kind: "python",
  roles: ["miles"],
  capabilities: ["deterministic"],
});

/** Format validation cannot prove entropy: generate this with randomBytes(32). */
export function assertMobileWorkerCredential(value: string): string {
  if (
    value.length !== 49 ||
    !/^tylrt_[A-Za-z0-9_-]{43}$/.test(value) ||
    new Set(value.slice(6)).size < 8
  ) {
    throw new DomainError(
      "invalid_transition",
      "Mobile worker credential must be a generated 256-bit tylrt_ credential.",
    );
  }
  return value;
}

export function mobileRuntimePreparationAction(
  existing: Runtime | null,
  credentialOwner: Runtime | null,
  roles: readonly Role[],
  capabilities: readonly RuntimeCapability[],
): "create" | "unchanged" {
  if (existing === null && credentialOwner === null) return "create";
  if (
    existing !== null &&
    credentialOwner?.id === existing.id &&
    existing.instanceKey === MOBILE_RUNTIME_INPUT.instanceKey &&
    existing.kind === "python" &&
    existing.status === "enabled" &&
    roles.length === 1 &&
    roles[0] === "miles" &&
    capabilities.length === 1 &&
    capabilities[0] === "deterministic"
  )
    return "unchanged";
  throw new DomainError(
    "conflict",
    "Mobile runtime preparation conflicts with existing identity, credential, status, or grants. Nothing was replaced.",
  );
}
