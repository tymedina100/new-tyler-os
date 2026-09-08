import "dotenv/config";
import { standingAuthorityKeySchema } from "@/domain/runtime/standing-authority-schema";
import { getDb } from "@/server/db/client";
import { revokeStandingAuthority } from "@/server/runtime/standing-authority-service";

/**
 * Disable a standing authority by key. Historical auto-executions stay as they were.
 *
 *   pnpm authority:revoke -- --key miles-ai-briefing-note
 */

const args = parseArgs(process.argv.slice(2));
const { key } = standingAuthorityKeySchema.parse({ key: args.key });
const authority = await revokeStandingAuthority(getDb(), key);

process.stdout.write(
  [
    `key=${authority.key}`,
    `enabled=${authority.enabled}`,
    "Future matching runs wait on Tyler.",
    "",
  ].join("\n"),
);
process.exit(0);

function parseArgs(argv: string[]): { key?: string } {
  const result: { key?: string } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part?.startsWith("--")) continue;
    const flag = part.slice(2);
    const next = argv[index + 1];
    const value = next && !next.startsWith("--") ? next : undefined;
    if (value) index += 1;
    if (value && flag === "key") result.key = value;
  }

  return result;
}
