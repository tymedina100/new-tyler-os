import { DomainError } from "@/domain/shared/errors";
import { INSTANCE_KEY_PATTERN, type RuntimeCapability } from "./fleet";
import type { Role } from "./runtime";

/**
 * Instance identity and role grants.
 *
 * A worker does not become Miles by sending a header. TylerOS records which
 * roles an instance may claim; the header is the role it is asking to act as.
 */

export function assertInstanceKey(value: string): string {
  const key = value.trim();
  if (!INSTANCE_KEY_PATTERN.test(key)) {
    throw new DomainError(
      "invalid_transition",
      "Instance keys are lowercase kebab-case, like home-desktop-python.",
    );
  }
  return key;
}

export function assertRoleGranted(granted: readonly Role[], role: Role): void {
  if (!granted.includes(role)) {
    throw new DomainError("invalid_transition", `This runtime is not allowed to act as ${role}.`);
  }
}

/** Bootstrap must name the roles. Miles is never implied. */
export function assertExplicitRoles(roles: readonly Role[]): Role[] {
  const unique = [...new Set(roles)];
  if (unique.length === 0) {
    throw new DomainError(
      "invalid_transition",
      "A runtime needs an explicit role grant, for example --role miles.",
    );
  }
  return unique;
}

export function uniqueCapabilities(values: readonly RuntimeCapability[]): RuntimeCapability[] {
  return [...new Set(values)];
}
