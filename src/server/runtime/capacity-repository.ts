import { desc, eq, gte } from "drizzle-orm";
import type { CapacityPool, CapacityUpdate, UsageEntry } from "@/domain/runtime/capacity";
import type { Database } from "@/server/db/client";
import { capacityPools, capacityUpdates, usageEntries } from "@/server/db/schema";

export function toCapacityPool(row: typeof capacityPools.$inferSelect): CapacityPool {
  return {
    id: row.id,
    provider: row.provider,
    product: row.product,
    poolKey: row.poolKey,
    displayName: row.displayName,
    remaining: row.remaining,
    remainingUnit: row.remainingUnit,
    estimateConfidence: row.estimateConfidence,
    resetType: row.resetType,
    resetAt: row.resetAt,
    resetTimezone: row.resetTimezone,
    lastVerifiedAt: row.lastVerifiedAt,
    hardDollarLimit: row.hardDollarLimit,
    sourceNote: row.sourceNote,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toUsageEntry(row: typeof usageEntries.$inferSelect): UsageEntry {
  return {
    id: row.id,
    runId: row.runId,
    runtimeId: row.runtimeId,
    provider: row.provider,
    product: row.product,
    poolKey: row.poolKey,
    model: row.model,
    inputTokens: row.inputTokens,
    cachedInputTokens: row.cachedInputTokens,
    outputTokens: row.outputTokens,
    estimatedCostUsd: row.estimatedCostUsd,
    recordedAt: row.recordedAt,
  };
}

export async function listCapacityPools(db: Database): Promise<CapacityPool[]> {
  const rows = await db
    .select()
    .from(capacityPools)
    .orderBy(capacityPools.provider, capacityPools.displayName);
  return rows.map(toCapacityPool);
}

export async function findCapacityPoolById(db: Database, id: string): Promise<CapacityPool | null> {
  const [row] = await db.select().from(capacityPools).where(eq(capacityPools.id, id)).limit(1);
  return row ? toCapacityPool(row) : null;
}

export async function findCapacityPoolByKey(
  db: Database,
  poolKey: string,
): Promise<CapacityPool | null> {
  const [row] = await db
    .select()
    .from(capacityPools)
    .where(eq(capacityPools.poolKey, poolKey))
    .limit(1);
  return row ? toCapacityPool(row) : null;
}

export async function updateCapacityRemaining(
  db: Database,
  id: string,
  remaining: number,
  estimateConfidence: CapacityPool["estimateConfidence"],
  now: Date,
): Promise<CapacityPool | null> {
  const [row] = await db
    .update(capacityPools)
    .set({
      remaining,
      estimateConfidence,
      lastVerifiedAt: now,
      updatedAt: now,
    })
    .where(eq(capacityPools.id, id))
    .returning();
  return row ? toCapacityPool(row) : null;
}

export async function insertCapacityUpdate(
  db: Database,
  values: {
    poolId: string;
    previousRemaining: number | null;
    newRemaining: number | null;
    note: string | null;
    recordedAt: Date;
  },
): Promise<CapacityUpdate> {
  const [row] = await db.insert(capacityUpdates).values(values).returning();
  if (!row) throw new Error("Insert returned no capacity update.");
  return {
    id: row.id,
    poolId: row.poolId,
    previousRemaining: row.previousRemaining,
    newRemaining: row.newRemaining,
    note: row.note,
    recordedAt: row.recordedAt,
  };
}

export async function listRecentUsage(db: Database, limit = 20): Promise<UsageEntry[]> {
  const rows = await db
    .select()
    .from(usageEntries)
    .orderBy(desc(usageEntries.recordedAt))
    .limit(limit);
  return rows.map(toUsageEntry);
}

export async function listUsageSince(db: Database, since: Date): Promise<UsageEntry[]> {
  const rows = await db
    .select()
    .from(usageEntries)
    .where(gte(usageEntries.recordedAt, since))
    .orderBy(desc(usageEntries.recordedAt));
  return rows.map(toUsageEntry);
}

export async function listUsageForRun(db: Database, runId: string): Promise<UsageEntry[]> {
  const rows = await db.select().from(usageEntries).where(eq(usageEntries.runId, runId));
  return rows.map(toUsageEntry);
}

export async function insertUsageEntry(
  db: Database,
  values: {
    runId: string;
    runtimeId: string;
    provider: string | null;
    product?: string | null;
    poolKey?: string | null;
    model: string | null;
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    estimatedCostUsd: number | null;
    recordedAt: Date;
  },
): Promise<void> {
  await db.insert(usageEntries).values({
    runId: values.runId,
    runtimeId: values.runtimeId,
    provider: values.provider,
    product: values.product ?? null,
    poolKey: values.poolKey ?? null,
    model: values.model,
    inputTokens: values.inputTokens,
    cachedInputTokens: values.cachedInputTokens,
    outputTokens: values.outputTokens,
    estimatedCostUsd: values.estimatedCostUsd,
    recordedAt: values.recordedAt,
  });
}
