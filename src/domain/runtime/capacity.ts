/**
 * Provider capacity pools — quota, not routing.
 *
 * One provider may have several independent pools (Cursor Pro coding vs a
 * PAYG API budget). Numbers here are observed or estimated, never scraped,
 * and never invented by a migration. See ADR 037.
 */

export const CAPACITY_UNITS = ["usd", "percent", "requests", "tokens", "unknown"] as const;
export type CapacityUnit = (typeof CAPACITY_UNITS)[number];

export const CAPACITY_CONFIDENCE = ["exact", "estimated", "unknown"] as const;
export type CapacityConfidence = (typeof CAPACITY_CONFIDENCE)[number];

export const CAPACITY_RESET_TYPES = ["none", "daily", "weekly", "monthly", "unknown"] as const;
export type CapacityResetType = (typeof CAPACITY_RESET_TYPES)[number];

export const CAPACITY_UNIT_LABELS: Record<CapacityUnit, string> = {
  usd: "USD",
  percent: "percent",
  requests: "requests",
  tokens: "tokens",
  unknown: "units",
};

export const CAPACITY_CONFIDENCE_LABELS: Record<CapacityConfidence, string> = {
  exact: "Exact",
  estimated: "Estimated",
  unknown: "Unknown",
};

/**
 * Recent-usage dollars. Null is unknown, not a measured zero.
 * This does not invent Anthropic prices.
 */
export function formatEstimatedCostUsd(value: number | null): string {
  if (value === null) return "cost unknown";
  return `$${value.toFixed(4)}`;
}

export interface CapacityPool {
  id: string;
  provider: string;
  product: string;
  poolKey: string;
  displayName: string;
  remaining: number | null;
  remainingUnit: CapacityUnit;
  estimateConfidence: CapacityConfidence;
  resetType: CapacityResetType;
  resetAt: Date | null;
  resetTimezone: string | null;
  lastVerifiedAt: Date | null;
  hardDollarLimit: number | null;
  sourceNote: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CapacityUpdate {
  id: string;
  poolId: string;
  previousRemaining: number | null;
  newRemaining: number | null;
  note: string | null;
  recordedAt: Date;
}

export interface UsageEntry {
  id: string;
  runId: string;
  runtimeId: string;
  provider: string | null;
  product: string | null;
  poolKey: string | null;
  model: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  recordedAt: Date;
}

export interface ExhaustionForecast {
  kind: "estimated";
  dailyBurnUsd: number;
  daysUntilExhaustion: number | null;
  likelyBeforeReset: boolean | null;
  summary: string;
}
