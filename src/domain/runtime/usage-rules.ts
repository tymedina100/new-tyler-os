import type { RunUsage } from "./runtime";

/**
 * Usage written to the ledger.
 *
 * Deterministic work records zero-AI usage explicitly so later routing is
 * not looking at a null that might mean "unknown model."
 */

const DETERMINISTIC_PROVIDERS = new Set(["none", "deterministic"]);
const DETERMINISTIC_MODELS = new Set(["deterministic", "none"]);

export function ledgerUsage(usage: RunUsage): RunUsage {
  if (!isDeterministic(usage)) return usage;

  return {
    provider: usage.provider ?? "none",
    model: usage.model ?? "deterministic",
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.cachedInputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    estimatedCostUsd: usage.estimatedCostUsd ?? 0,
  };
}

export function isDeterministic(usage: Pick<RunUsage, "provider" | "model">): boolean {
  const provider = usage.provider?.trim().toLowerCase() ?? "";
  const model = usage.model?.trim().toLowerCase() ?? "";
  return DETERMINISTIC_PROVIDERS.has(provider) || DETERMINISTIC_MODELS.has(model);
}
