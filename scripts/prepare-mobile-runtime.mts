import "dotenv/config";
import { getDb } from "@/server/db/client";
import { prepareMobileRuntime } from "@/server/runtime/mobile-runtime-preparation-service";

// Hosted build: pnpm db:migrate && pnpm exec tsx scripts/prepare-mobile-runtime.mts && pnpm build
// This optional secret belongs in the encrypted branch environment and worker only.
const credential = process.env.TYLEROS_MOBILE_WORKER_CREDENTIAL;
if (credential === undefined) {
  process.stdout.write("Mobile runtime preparation skipped: optional credential is unset.\n");
  process.exit(0);
}
try {
  const result = await prepareMobileRuntime(getDb(), credential);
  process.stdout.write(
    `Mobile runtime ${result.action}: mobile-companion-python (python; miles).\n`,
  );
  process.exit(0);
} catch {
  // Driver errors can include credentials, SQL parameters, or connection strings.
  process.stderr.write(
    "Mobile runtime preparation failed. Verify credential format and existing fleet identity/grants; no existing authentication or grants were replaced. Database changes were rolled back.\n",
  );
  process.exit(1);
}
