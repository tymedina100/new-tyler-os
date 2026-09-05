import {
  BURN_WINDOW_DAYS,
  assertCapacityRemaining,
  dailyBurnUsd,
  estimateExhaustion,
} from "@/domain/runtime/capacity-rules";
import type { CapacityPool, ExhaustionForecast, UsageEntry } from "@/domain/runtime/capacity";
import { deriveRuntimeHealth, formatLastSeen } from "@/domain/runtime/health";
import type { RuntimeCapability, RuntimeHealth } from "@/domain/runtime/fleet";
import type { Runtime } from "@/domain/runtime/runtime";
import { DEFAULT_SCHEDULE_TIMEZONE } from "@/domain/runtime/schedule";
import { zonedCivilTime } from "@/domain/runtime/schedule-rules";
import { NotFoundError } from "@/domain/shared/errors";
import type { Database } from "@/server/db/client";
import * as capacityRepo from "./capacity-repository";
import * as fleetRepo from "./fleet-repository";
import * as runtimeRepo from "./runtime-repository";

/**
 * Read models for capacity and fleet health.
 *
 * A future world view should query these rather than invent activity.
 * This slice does not route, scrape, or alert.
 */

export interface FleetRuntimeView {
  runtime: Runtime;
  health: RuntimeHealth;
  lastSeenLabel: string;
  capabilities: readonly RuntimeCapability[];
  roles: readonly string[];
}

export interface CapacityPoolView {
  pool: CapacityPool;
  forecast: ExhaustionForecast;
}

export interface FleetBoard {
  runtimes: FleetRuntimeView[];
  pools: CapacityPoolView[];
  recentUsage: UsageEntry[];
  spendTodayUsd: number;
  spendWindowUsd: number;
}

export async function listFleetBoard(db: Database, now = new Date()): Promise<FleetBoard> {
  const [instances, capabilityMap, pools, recentUsage, windowUsage] = await Promise.all([
    runtimeRepo.listRuntimes(db),
    fleetRepo.listCapabilitiesByRuntime(db),
    capacityRepo.listCapacityPools(db),
    capacityRepo.listRecentUsage(db, 20),
    capacityRepo.listUsageSince(db, new Date(now.getTime() - BURN_WINDOW_DAYS * 86_400_000)),
  ]);

  const grants = await Promise.all(
    instances.map(
      async (runtime) => [runtime.id, await fleetRepo.listRoleGrants(db, runtime.id)] as const,
    ),
  );
  const grantMap = new Map(grants);

  const burn = dailyBurnUsd(
    windowUsage
      .map((entry) => entry.estimatedCostUsd)
      .filter((value): value is number => value !== null),
  );

  const { minutes } = zonedCivilTime(now, DEFAULT_SCHEDULE_TIMEZONE);
  const startOfDay = new Date(now.getTime() - minutes * 60_000);
  const spendTodayUsd = windowUsage
    .filter((entry) => entry.recordedAt >= startOfDay)
    .reduce((sum, entry) => sum + (entry.estimatedCostUsd ?? 0), 0);

  return {
    runtimes: instances.map((runtime) => ({
      runtime,
      health: deriveRuntimeHealth(runtime.status, runtime.lastSeenAt, now),
      lastSeenLabel: formatLastSeen(runtime.lastSeenAt, now),
      capabilities: capabilityMap.get(runtime.id) ?? [],
      roles: grantMap.get(runtime.id) ?? [],
    })),
    pools: pools.map((pool) => ({
      pool,
      forecast: estimateExhaustion(pool, burn, now),
    })),
    recentUsage,
    spendTodayUsd,
    spendWindowUsd: burn * BURN_WINDOW_DAYS,
  };
}

export async function updatePoolRemaining(
  db: Database,
  input: {
    poolId: string;
    remaining: number;
    estimateConfidence?: CapacityPool["estimateConfidence"];
    note?: string | null;
  },
  now = new Date(),
): Promise<CapacityPool> {
  return db.transaction(async (tx) => {
    const pool = await capacityRepo.findCapacityPoolById(tx, input.poolId);
    if (pool === null) throw new NotFoundError("Capacity pool", input.poolId);

    const remaining = assertCapacityRemaining(input.remaining, pool.remainingUnit);
    const updated = await capacityRepo.updateCapacityRemaining(
      tx,
      pool.id,
      remaining,
      input.estimateConfidence ?? pool.estimateConfidence,
      now,
    );
    if (updated === null) throw new NotFoundError("Capacity pool", pool.id);

    await capacityRepo.insertCapacityUpdate(tx, {
      poolId: pool.id,
      previousRemaining: pool.remaining,
      newRemaining: remaining,
      note: input.note ?? "Manual remaining update.",
      recordedAt: now,
    });

    return updated;
  });
}

export async function listUsageForRun(db: Database, runId: string): Promise<UsageEntry[]> {
  return capacityRepo.listUsageForRun(db, runId);
}
