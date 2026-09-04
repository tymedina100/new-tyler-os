import { DomainError } from "@/domain/shared/errors";
import type { CapacityPool, CapacityUnit, ExhaustionForecast } from "./capacity";

/**
 * Capacity remaining and a deliberately simple burn estimate.
 *
 * Remaining cannot go negative. Percent cannot exceed 100. Forecasting is
 * labeled estimated and is not a router.
 */

const BURN_WINDOW_DAYS = 7;

export function assertCapacityRemaining(remaining: number, unit: CapacityUnit): number {
  if (!Number.isFinite(remaining)) {
    throw new DomainError("invalid_transition", "Remaining capacity must be a finite number.");
  }
  if (remaining < 0) {
    throw new DomainError("invalid_transition", "Remaining capacity cannot be negative.");
  }
  if (unit === "percent" && remaining > 100) {
    throw new DomainError("invalid_transition", "Percent remaining cannot exceed 100.");
  }
  return remaining;
}

export function dailyBurnUsd(costs: readonly number[], windowDays = BURN_WINDOW_DAYS): number {
  if (windowDays <= 0) return 0;
  const total = costs.reduce((sum, value) => sum + Math.max(0, value), 0);
  return total / windowDays;
}

export function estimateExhaustion(
  pool: Pick<CapacityPool, "remaining" | "remainingUnit" | "resetAt" | "enabled">,
  burnPerDayUsd: number,
  now: Date,
): ExhaustionForecast {
  if (!pool.enabled) {
    return {
      kind: "estimated",
      dailyBurnUsd: burnPerDayUsd,
      daysUntilExhaustion: null,
      likelyBeforeReset: null,
      summary: "Pool disabled — not forecast.",
    };
  }

  if (pool.remainingUnit !== "usd" || pool.remaining === null) {
    return {
      kind: "estimated",
      dailyBurnUsd: burnPerDayUsd,
      daysUntilExhaustion: null,
      likelyBeforeReset: null,
      summary: "Estimated — this pool is not tracked in USD, so burn rate is not projected.",
    };
  }

  if (burnPerDayUsd <= 0) {
    return {
      kind: "estimated",
      dailyBurnUsd: 0,
      daysUntilExhaustion: null,
      likelyBeforeReset: false,
      summary: "Estimated — no USD spend in the recent window.",
    };
  }

  const daysUntilExhaustion = pool.remaining / burnPerDayUsd;
  const daysUntilReset =
    pool.resetAt === null ? null : (pool.resetAt.getTime() - now.getTime()) / 86_400_000;
  const likelyBeforeReset =
    daysUntilReset === null ? null : daysUntilExhaustion < daysUntilReset && daysUntilReset > 0;

  const summary =
    likelyBeforeReset === true
      ? `Estimated — at recent burn, this pool may exhaust before reset (${daysUntilExhaustion.toFixed(1)} days of runway).`
      : `Estimated — about ${daysUntilExhaustion.toFixed(1)} days of runway at recent burn.`;

  return {
    kind: "estimated",
    dailyBurnUsd: burnPerDayUsd,
    daysUntilExhaustion,
    likelyBeforeReset,
    summary,
  };
}

export { BURN_WINDOW_DAYS };
