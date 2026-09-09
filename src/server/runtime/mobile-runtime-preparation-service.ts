import {
  assertMobileWorkerCredential,
  MOBILE_RUNTIME_INPUT,
  mobileRuntimePreparationAction,
} from "@/domain/runtime/mobile-runtime-preparation";
import { DomainError } from "@/domain/shared/errors";
import type { Database } from "@/server/db/client";
import { hashRuntimeSecret } from "./runtime-token";
import * as fleetRepo from "./fleet-repository";
import { findRuntimeByInstanceKey } from "./runtime-repository";

/** Optional hosted bootstrap. Never rotates credentials or rewrites existing grants. */
export async function prepareMobileRuntime(db: Database, credential: string, now = new Date()) {
  const tokenHash = hashRuntimeSecret(assertMobileWorkerCredential(credential));
  try {
    return await db.transaction(async (tx) => {
      const existing = await findRuntimeByInstanceKey(tx, MOBILE_RUNTIME_INPUT.instanceKey);
      const owner = await fleetRepo.findRuntimeByTokenHash(tx, tokenHash);
      const roles = existing ? await fleetRepo.listRoleGrants(tx, existing.id) : [];
      const capabilities = existing ? await fleetRepo.listCapabilities(tx, existing.id) : [];
      const action = mobileRuntimePreparationAction(existing, owner, roles, capabilities);
      if (action === "unchanged" && existing) return { action, runtime: existing };
      const runtime = await fleetRepo.insertRuntime(tx, {
        instanceKey: MOBILE_RUNTIME_INPUT.instanceKey,
        name: MOBILE_RUNTIME_INPUT.name,
        kind: MOBILE_RUNTIME_INPUT.kind,
        deviceId: null,
      });
      await fleetRepo.insertCredential(tx, runtime.id, tokenHash, now);
      await fleetRepo.replaceCapabilities(tx, runtime.id, ["deterministic"]);
      await fleetRepo.replaceRoleGrants(tx, runtime.id, MOBILE_RUNTIME_INPUT.roles);
      return { action, runtime };
    });
  } catch (error) {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
      if ((current as { code?: unknown }).code === "23505") {
        throw new DomainError(
          "conflict",
          "Mobile runtime identity or credential already exists. Nothing was replaced; inspect the fleet before retrying.",
        );
      }
      current = (current as { cause?: unknown }).cause;
    }
    throw error;
  }
}
