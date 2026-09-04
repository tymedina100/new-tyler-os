import "dotenv/config";
import { bootstrapRuntimeSchema } from "@/domain/runtime/fleet-schema";
import { getDb } from "@/server/db/client";
import { bootstrapRuntime } from "@/server/runtime/fleet-service";

/**
 * Create a runtime instance credential. Prints the token once to stdout.
 * Store it in the worker's environment; it is not saved in plaintext.
 *
 *   pnpm runtime:bootstrap -- --key home-desktop-python --name "Home Desktop Python"
 */

const args = parseArgs(process.argv.slice(2));
const input = bootstrapRuntimeSchema.parse({
  instanceKey: args.key ?? "home-desktop-python",
  name: args.name ?? "Home Desktop Python",
  kind: args.kind ?? "python",
  deviceId: args.device ?? null,
  roles: ["miles"],
});

const { runtime, token } = await bootstrapRuntime(getDb(), input);

process.stdout.write(
  [
    `instance_key=${runtime.instanceKey}`,
    `id=${runtime.id}`,
    `kind=${runtime.kind}`,
    `TYLEROS_RUNTIME_CREDENTIAL=${token}`,
    "Store the credential in the worker environment. It will not be shown again.",
    "",
  ].join("\n"),
);
process.exit(0);
process.exit(0);

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part?.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = "true";
    }
  }
  return result;
}
