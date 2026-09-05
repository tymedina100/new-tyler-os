import "dotenv/config";
import { bootstrapRuntimeSchema } from "@/domain/runtime/fleet-schema";
import { getDb } from "@/server/db/client";
import { bootstrapRuntime } from "@/server/runtime/fleet-service";

/**
 * Create a runtime instance credential. Prints the token once to stdout.
 * Store it in the worker's environment; it is not saved in plaintext.
 *
 *   pnpm runtime:bootstrap -- --key home-desktop-python --name "Home Desktop Python" --role miles
 */

const args = parseArgs(process.argv.slice(2));
const input = bootstrapRuntimeSchema.parse({
  instanceKey: args.key ?? "home-desktop-python",
  name: args.name ?? "Home Desktop Python",
  kind: args.kind ?? "python",
  deviceId: args.device ?? null,
  roles: args.roles,
});

const { runtime, token } = await bootstrapRuntime(getDb(), input);

process.stdout.write(
  [
    `instance_key=${runtime.instanceKey}`,
    `id=${runtime.id}`,
    `kind=${runtime.kind}`,
    `roles=${input.roles.join(",")}`,
    `TYLEROS_RUNTIME_CREDENTIAL=${token}`,
    "Store the credential in the worker environment. It will not be shown again.",
    "",
  ].join("\n"),
);
process.exit(0);

function parseArgs(argv: string[]): {
  key?: string;
  name?: string;
  kind?: string;
  device?: string;
  roles: string[];
} {
  const result: { key?: string; name?: string; kind?: string; device?: string; roles: string[] } = {
    roles: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part?.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[index + 1];
    const value = next && !next.startsWith("--") ? next : undefined;
    if (value) index += 1;

    if (key === "role" || key === "roles") {
      if (value)
        result.roles.push(
          ...value
            .split(",")
            .map((role) => role.trim())
            .filter(Boolean),
        );
      continue;
    }

    if (value && (key === "key" || key === "name" || key === "kind" || key === "device")) {
      result[key] = value;
    }
  }

  return result;
}
