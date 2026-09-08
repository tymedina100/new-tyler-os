/**
 * Standing authority: an explicit, durable grant of what Tyler has delegated.
 *
 * It sits between a proposed action and execution. It is not a role, a
 * model, a provider, an approval bypass, or a generic autonomous mode.
 * Absent a matching enabled row, current pending-approval behaviour remains.
 * See ADR 039.
 */

import type { ApprovalKind, JobKind, Role } from "./runtime";

export const STANDING_AUTHORITY_KEY_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;

export interface StandingAuthority {
  id: string;
  key: string;
  role: Role;
  jobKind: JobKind;
  action: ApprovalKind;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StandingAuthorityRequest {
  role: Role;
  jobKind: JobKind;
  action: ApprovalKind;
}
