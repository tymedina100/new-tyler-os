import { and, eq, isNull } from "drizzle-orm";
import type { RuntimeCapability } from "@/domain/runtime/fleet";
import type { Role, Runtime, RuntimeKind, RuntimeStatus } from "@/domain/runtime/runtime";
import type { Database } from "@/server/db/client";
import {
  runtimeCapabilities,
  runtimeCredentials,
  runtimeRoleGrants,
  runtimes,
} from "@/server/db/schema";
import { toRuntime } from "./runtime-rows";

export async function insertRuntime(
  db: Database,
  values: {
    instanceKey: string;
    name: string;
    kind: RuntimeKind;
    deviceId: string | null;
    status?: RuntimeStatus;
  },
): Promise<Runtime> {
  const [row] = await db
    .insert(runtimes)
    .values({
      instanceKey: values.instanceKey,
      name: values.name,
      kind: values.kind,
      deviceId: values.deviceId,
      status: values.status ?? "enabled",
    })
    .returning();

  if (!row) throw new Error("Insert returned no runtime.");
  return toRuntime(row);
}

export async function insertCredential(
  db: Database,
  runtimeId: string,
  tokenHash: string,
  now: Date,
): Promise<void> {
  await db.insert(runtimeCredentials).values({
    runtimeId,
    tokenHash,
    createdAt: now,
  });
}

export async function findRuntimeByTokenHash(
  db: Database,
  tokenHash: string,
): Promise<Runtime | null> {
  const [row] = await db
    .select({ runtime: runtimes })
    .from(runtimeCredentials)
    .innerJoin(runtimes, eq(runtimeCredentials.runtimeId, runtimes.id))
    .where(and(eq(runtimeCredentials.tokenHash, tokenHash), isNull(runtimeCredentials.revokedAt)))
    .limit(1);

  return row ? toRuntime(row.runtime) : null;
}

export async function touchCredentialLastUsed(
  db: Database,
  tokenHash: string,
  now: Date,
): Promise<void> {
  await db
    .update(runtimeCredentials)
    .set({ lastUsedAt: now })
    .where(eq(runtimeCredentials.tokenHash, tokenHash));
}

export async function replaceCapabilities(
  db: Database,
  runtimeId: string,
  capabilities: readonly RuntimeCapability[],
): Promise<void> {
  await db.delete(runtimeCapabilities).where(eq(runtimeCapabilities.runtimeId, runtimeId));
  if (capabilities.length === 0) return;
  await db
    .insert(runtimeCapabilities)
    .values(capabilities.map((capability) => ({ runtimeId, capability })));
}

export async function replaceRoleGrants(
  db: Database,
  runtimeId: string,
  roles: readonly Role[],
): Promise<void> {
  await db.delete(runtimeRoleGrants).where(eq(runtimeRoleGrants.runtimeId, runtimeId));
  if (roles.length === 0) return;
  await db.insert(runtimeRoleGrants).values(roles.map((role) => ({ runtimeId, role })));
}

export async function listCapabilities(
  db: Database,
  runtimeId: string,
): Promise<RuntimeCapability[]> {
  const rows = await db
    .select({ capability: runtimeCapabilities.capability })
    .from(runtimeCapabilities)
    .where(eq(runtimeCapabilities.runtimeId, runtimeId));
  return rows.map((row) => row.capability);
}

export async function listRoleGrants(db: Database, runtimeId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: runtimeRoleGrants.role })
    .from(runtimeRoleGrants)
    .where(eq(runtimeRoleGrants.runtimeId, runtimeId));
  return rows.map((row) => row.role);
}

export async function listCapabilitiesByRuntime(
  db: Database,
): Promise<Map<string, RuntimeCapability[]>> {
  const rows = await db.select().from(runtimeCapabilities);
  const map = new Map<string, RuntimeCapability[]>();
  for (const row of rows) {
    const current = map.get(row.runtimeId) ?? [];
    current.push(row.capability);
    map.set(row.runtimeId, current);
  }
  return map;
}
