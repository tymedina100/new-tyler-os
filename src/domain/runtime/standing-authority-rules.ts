import type { StandingAuthority, StandingAuthorityRequest } from "./standing-authority";

/**
 * Exact match only: role, job kind, and action. Enabled rows that miss any
 * field do not authorize. Role-only matching is impossible because the request
 * type requires all three fields.
 */
export function matchStandingAuthority(
  authorities: readonly StandingAuthority[],
  request: StandingAuthorityRequest,
): StandingAuthority | null {
  const matches = authorities.filter(
    (authority) =>
      authority.enabled &&
      authority.role === request.role &&
      authority.jobKind === request.jobKind &&
      authority.action === request.action,
  );

  if (matches.length === 0) return null;
  return [...matches].sort((left, right) => left.key.localeCompare(right.key))[0] ?? null;
}

export function proposalDisposition(
  hasProposal: boolean,
  authorized: boolean,
): "none" | "pending_approval" | "auto_executed" {
  if (!hasProposal) return "none";
  return authorized ? "auto_executed" : "pending_approval";
}
