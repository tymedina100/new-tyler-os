import { DomainError, NotFoundError } from "@/domain/shared/errors";
import type { AiExecutionProfile } from "@/domain/runtime/ai-profile";
import type { CreateAiExecutionProfileInput } from "@/domain/runtime/ai-profile-schema";
import type { Database } from "@/server/db/client";
import * as capacityRepo from "./capacity-repository";
import * as repo from "./ai-profile-repository";

/**
 * Explicit AI execution profiles. No default, no router, no secrets.
 */

export async function createAiExecutionProfile(
  db: Database,
  input: CreateAiExecutionProfileInput,
): Promise<AiExecutionProfile> {
  const existing = await repo.findAiExecutionProfileByKey(db, input.key);
  if (existing) {
    throw new DomainError("conflict", `AI execution profile ${input.key} already exists.`);
  }

  let capacityPoolId: string | null = null;
  if (input.poolKey) {
    const pool = await capacityRepo.findCapacityPoolByKey(db, input.poolKey);
    if (pool === null) throw new NotFoundError("Capacity pool", input.poolKey);
    capacityPoolId = pool.id;
  }

  try {
    return await repo.insertAiExecutionProfile(db, {
      key: input.key,
      name: input.name,
      provider: input.provider,
      model: input.model,
      product: input.product,
      capacityPoolId,
      enabled: input.enabled,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("conflict", `AI execution profile ${input.key} already exists.`);
    }
    throw error;
  }
}

export async function getAiExecutionProfile(db: Database, id: string): Promise<AiExecutionProfile> {
  const profile = await repo.findAiExecutionProfileById(db, id);
  if (profile === null) throw new NotFoundError("AI execution profile", id);
  return profile;
}

export async function listEnabledAiExecutionProfiles(db: Database): Promise<AiExecutionProfile[]> {
  return repo.listEnabledAiExecutionProfiles(db);
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
