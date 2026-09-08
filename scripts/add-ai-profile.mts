import "dotenv/config";
import { createAiExecutionProfileSchema } from "@/domain/runtime/ai-profile-schema";
import { getDb } from "@/server/db/client";
import { createAiExecutionProfile } from "@/server/runtime/ai-profile-service";

/**
 * Create an explicit AI execution profile. Never stores an API key.
 *
 *   pnpm ai:profile:add -- \
 *     --key miles-briefing-primary \
 *     --name "Miles Briefing Primary" \
 *     --provider anthropic \
 *     --model claude-opus-5 \
 *     --pool <optional-real-pool-key>
 */

const args = parseArgs(process.argv.slice(2));
const input = createAiExecutionProfileSchema.parse({
  key: args.key,
  name: args.name,
  provider: args.provider,
  model: args.model,
  product: args.product,
  poolKey: args.pool,
});

const profile = await createAiExecutionProfile(getDb(), input);

process.stdout.write(
  [
    `key=${profile.key}`,
    `id=${profile.id}`,
    `provider=${profile.provider}`,
    `model=${profile.model}`,
    `pool=${args.pool ?? ""}`,
    "API keys are not stored. Set ANTHROPIC_API_KEY on the TylerOS runtime.",
    "",
  ].join("\n"),
);
process.exit(0);

function parseArgs(argv: string[]): {
  key?: string;
  name?: string;
  provider?: string;
  model?: string;
  product?: string;
  pool?: string;
} {
  const result: {
    key?: string;
    name?: string;
    provider?: string;
    model?: string;
    product?: string;
    pool?: string;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part?.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[index + 1];
    const value = next && !next.startsWith("--") ? next : undefined;
    if (value) index += 1;

    if (
      value &&
      (key === "key" ||
        key === "name" ||
        key === "provider" ||
        key === "model" ||
        key === "product" ||
        key === "pool")
    ) {
      result[key] = value;
    }
  }

  return result;
}
