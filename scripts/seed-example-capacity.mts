import "dotenv/config";
import { getDb } from "@/server/db/client";
import { capacityPools } from "@/server/db/schema";
import { EXAMPLE_CAPACITY_POOLS } from "./example-capacity-pools";

/**
 * Opt-in mock quota pools for local screenshots. Not a migration. Not db:seed.
 *
 *   pnpm capacity:seed-examples
 */

const db = getDb();
await db
  .insert(capacityPools)
  .values([...EXAMPLE_CAPACITY_POOLS])
  .onConflictDoNothing({
    target: capacityPools.poolKey,
  });
process.stdout.write(
  `Inserted ${EXAMPLE_CAPACITY_POOLS.length} example/mock capacity pools (skipped any that already exist).\n`,
);
process.exit(0);
