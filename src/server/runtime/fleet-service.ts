import type { Role, Runtime } from "@/domain/runtime/runtime";
import { defaultCapabilitiesFor, type RuntimeCapability } from "@/domain/runtime/fleet";
import {
  assertExplicitRoles,
  assertInstanceKey,
  uniqueCapabilities,
} from "@/domain/runtime/fleet-rules";
import { DomainError } from "@/domain/shared/errors";
import type { Database } from "@/server/db/client";
import { generateRuntimeCredential, hashRuntimeSecret } from "@/server/runtime/runtime-token";
import * as fleetRepo from "./fleet-repository";
import * as runtimeRepo from "./runtime-repository";

/**
 * Fleet instances and credentials.
 *
 * Bootstrap is the only place a plaintext token exists. It is returned once
 * and hashed before insert. Roles are grants, not headers the worker invents.
 */

export async function bootstrapRuntime(
  db: Database,
  input: {
    instanceKey: string;
    name: string;
    kind: Runtime["kind"];
    deviceId?: string | null;
    capabilities?: readonly RuntimeCapability[];
    roles: readonly Role[];
    status?: Runtime["status"];
  },
  now = new Date(),
): Promise<{ runtime: Runtime; token: string }> {
  const instanceKey = assertInstanceKey(input.instanceKey);
  const existing = await runtimeRepo.findRuntimeByInstanceKey(db, instanceKey);
  if (existing) {
    throw new DomainError("conflict", `Runtime ${instanceKey} already exists.`);
  }

  const token = generateRuntimeCredential();
  const capabilities = uniqueCapabilities(input.capabilities ?? defaultCapabilitiesFor(input.kind));
  const roles = assertExplicitRoles(input.roles);

  const runtime = await db.transaction(async (tx) => {
    const created = await fleetRepo.insertRuntime(tx, {
      instanceKey,
      name: input.name.trim(),
      kind: input.kind,
      deviceId: input.deviceId ?? null,
      status: input.status,
    });
    await fleetRepo.insertCredential(tx, created.id, hashRuntimeSecret(token), now);
    await fleetRepo.replaceCapabilities(tx, created.id, capabilities);
    await fleetRepo.replaceRoleGrants(tx, created.id, roles);
    return created;
  });

  return { runtime, token };
}

export async function findRuntimeByCredential(
  db: Database,
  presented: string,
  now = new Date(),
): Promise<Runtime | null> {
  const runtime = await fleetRepo.findRuntimeByTokenHash(db, hashRuntimeSecret(presented));
  if (runtime === null) return null;
  await fleetRepo.touchCredentialLastUsed(db, hashRuntimeSecret(presented), now);
  return runtime;
}

export async function listGrantedRoles(db: Database, runtimeId: string): Promise<Role[]> {
  return fleetRepo.listRoleGrants(db, runtimeId);
}
