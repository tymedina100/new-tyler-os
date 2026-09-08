import { DomainError, NotFoundError } from "@/domain/shared/errors";
import type {
  StandingAuthority,
  StandingAuthorityRequest,
} from "@/domain/runtime/standing-authority";
import type { GrantStandingAuthorityInput } from "@/domain/runtime/standing-authority-schema";
import { matchStandingAuthority } from "@/domain/runtime/standing-authority-rules";
import type { Database } from "@/server/db/client";
import * as repo from "./standing-authority-repository";

/**
 * Explicit standing-authority grants. No silent Miles default. Policy matching
 * lives in the domain; this layer loads rows and persists patches.
 */

export async function grantStandingAuthority(
  db: Database,
  input: GrantStandingAuthorityInput,
): Promise<StandingAuthority> {
  const existing = await repo.findStandingAuthorityByKey(db, input.key);
  if (existing) {
    throw new DomainError("conflict", `Standing authority ${input.key} already exists.`);
  }

  try {
    return await repo.insertStandingAuthority(db, {
      key: input.key,
      role: input.role,
      jobKind: input.jobKind,
      action: input.action,
      enabled: true,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("conflict", `Standing authority ${input.key} already exists.`);
    }
    throw error;
  }
}

export async function revokeStandingAuthority(
  db: Database,
  key: string,
): Promise<StandingAuthority> {
  return setStandingAuthorityEnabled(db, key, false);
}

export async function enableStandingAuthority(
  db: Database,
  key: string,
): Promise<StandingAuthority> {
  return setStandingAuthorityEnabled(db, key, true);
}

export async function listStandingAuthorities(db: Database): Promise<StandingAuthority[]> {
  return repo.listStandingAuthorities(db);
}

export async function findMatchingStandingAuthority(
  db: Database,
  request: StandingAuthorityRequest,
): Promise<StandingAuthority | null> {
  const enabled = await repo.listEnabledStandingAuthorities(db);
  return matchStandingAuthority(enabled, request);
}

async function setStandingAuthorityEnabled(
  db: Database,
  key: string,
  enabled: boolean,
): Promise<StandingAuthority> {
  const updated = await repo.updateStandingAuthorityEnabled(db, key, enabled);
  if (updated === null) throw new NotFoundError("Standing authority", key);
  return updated;
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
