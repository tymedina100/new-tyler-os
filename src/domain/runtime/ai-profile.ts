/**
 * AI execution profiles: explicit provider/model metadata, not org roles.
 *
 * Tyler selects a profile. Miles still owns the job. The runtime instance
 * executes. The profile only names which official API and model that run
 * may call. Secrets never live here. See ADR 038.
 */

export const AI_PROVIDERS = ["anthropic"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic",
};

export const AI_PROFILE_KEY_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;

export function isAiProvider(value: string): value is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

export interface AiExecutionProfile {
  id: string;
  key: string;
  name: string;
  provider: AiProvider;
  model: string;
  product: string | null;
  capacityPoolId: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
