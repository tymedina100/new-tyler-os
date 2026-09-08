import "dotenv/config";
import { grantStandingAuthoritySchema } from "@/domain/runtime/standing-authority-schema";
import { getDb } from "@/server/db/client";
import { grantStandingAuthority } from "@/server/runtime/standing-authority-service";

/**
 * Grant an explicit standing authority. Fresh databases grant nothing.
 *
 *   pnpm authority:grant -- \
 *     --key miles-ai-briefing-note \
 *     --role miles \
 *     --job today_briefing_ai \
 *     --action create_note
 */

const args = parseArgs(process.argv.slice(2));
const input = grantStandingAuthoritySchema.parse({
  key: args.key,
  role: args.role,
  jobKind: args.job,
  action: args.action,
});

const authority = await grantStandingAuthority(getDb(), input);

process.stdout.write(
  [
    `key=${authority.key}`,
    `id=${authority.id}`,
    `role=${authority.role}`,
    `job=${authority.jobKind}`,
    `action=${authority.action}`,
    `enabled=${authority.enabled}`,
    "No silent default. This grant is the only reason Miles may auto-execute.",
    "",
  ].join("\n"),
);
process.exit(0);

function parseArgs(argv: string[]): {
  key?: string;
  role?: string;
  job?: string;
  action?: string;
} {
  const result: { key?: string; role?: string; job?: string; action?: string } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part?.startsWith("--")) continue;
    const flag = part.slice(2);
    const next = argv[index + 1];
    const value = next && !next.startsWith("--") ? next : undefined;
    if (value) index += 1;

    if (value && (flag === "key" || flag === "role" || flag === "job" || flag === "action")) {
      result[flag] = value;
    }
  }

  return result;
}
